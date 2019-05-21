
import { data } from './data.js';
if (!navigator.gpu) {
  document.getElementById('not-supported').style.display = 'block';
  alert('WebGPU not supported! Please visit webgpu.io to see the current implementation status.');
}

var nodeIndexLookup = new Map();

var nodes = data
  .filter(item => {
    return item.type === 'node';
  })
  .map((node, idx) => {
    nodeIndexLookup.set(node.id, idx);
    return { id: idx, x: node.x, y: node.y, size: 27 * (node.e || 1) };
  });

var links = data
  .filter(item => {
    return item.type === 'link';
  })
  .map((link, idx) => {
    const id1 = nodeIndexLookup.get(link.id1);
    const id2 = nodeIndexLookup.get(link.id2);
    return { id1, id2 };
  });
const numNodes = nodes.length;
const numLinks = links.length*2;

async function init() {
  let fragmentShaderGLSL = await request('fragment.frag.glsl');
  let vertexShaderGLSL = await request('vertex.vert.glsl');
  let lineShaderGLSL = await request('line.vert.glsl');
  let computeShaderGLSL = await request('force.compute.glsl');
  computeShaderGLSL = computeShaderGLSL.replace(/\$\{numNodes\}/g, numNodes);
  computeShaderGLSL = computeShaderGLSL.replace(/\$\{numLinks\}/g, numLinks);;

  const adapter = await navigator.gpu.requestAdapter();
  const device = await adapter.requestDevice();
  await Utils.ready;

  const canvas = document.querySelector('canvas');
  const context = canvas.getContext('gpupresent');

  const swapChain = context.configureSwapChain({
    device,
    format: "bgra8unorm"
  });

  const computeBindGroupLayout = device.createBindGroupLayout({
    bindings: [
      { binding: 0, visibility: GPUShaderStageBit.COMPUTE, type: "storage-buffer" },
      { binding: 1, visibility: GPUShaderStageBit.COMPUTE, type: "storage-buffer" },
      { binding: 2, visibility: GPUShaderStageBit.COMPUTE, type: "storage-buffer" },
    ],
  });

  const computePipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [computeBindGroupLayout],
  });

  const renderPipeline = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [] }),

    vertexStage: {
      module: device.createShaderModule({
        code: Utils.compile("v", vertexShaderGLSL)
      }),
      entryPoint: "main"
    },
    fragmentStage: {
      module: device.createShaderModule({
        code: Utils.compile("f", fragmentShaderGLSL)
      }),
      entryPoint: "main"
    },

    primitiveTopology: "triangle-list",

    depthStencilState: {
      depthWriteEnabled: true,
      depthCompare: "less",
      format: "depth32float-stencil8",
      stencilFront: {},
      stencilBack: {},
    },

    vertexInput: {
      indexFormat: "uint32",
      vertexBuffers: [
        {
          // instanced particles buffer
          stride: 2 * 4,
          stepMode: "instance",
          attributes: [{
            // instance position
            shaderLocation: 0,
            offset: 0,
            format: "float2"
          }]
        },
        {
          // instanced particles buffer
          stride: 2 * 4,
          stepMode: "instance",
          attributes: [{
            // instance position
            shaderLocation: 1,
            offset: 0,
            format: "float2"
          }],
        },
        {
          // vertex buffer
          stride: 2 * 4,
          stepMode: "vertex",
          attributes: [{
            // vertex positions
            shaderLocation: 2,
            offset: 0,
            format: "float2"
          }],
        }
      ],
    },

    rasterizationState: {
      frontFace: 'ccw',
      cullMode: 'none',
    },

    colorStates: [{
      format: "bgra8unorm",
      alphaBlend: {},
      colorBlend: {},
    }],
  });

  const computePipeline = device.createComputePipeline({
    layout: computePipelineLayout,
    computeStage: {
      module: device.createShaderModule({
        code: Utils.compile("c", computeShaderGLSL)
      }),
      entryPoint: "main",
    }
  });

  const depthTexture = device.createTexture({
    size: { width: canvas.width, height: canvas.height, depth: 1 },
    arrayLayerCount: 1,
    mipLevelCount: 1,
    sampleCount: 1,
    dimension: "2d",
    format: "depth32float-stencil8",
    usage: GPUTextureUsage.OUTPUT_ATTACHMENT
  });

  const renderPassDescriptor = {
    colorAttachments: [{
      loadOp: "clear",
      storeOp: "store",
      clearColor: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 }
    }],
    depthStencilAttachment: {
      attachment: depthTexture.createDefaultView(),
      depthLoadOp: "clear",
      depthStoreOp: "store",
      stencilLoadOp: "clear",
      stencilStoreOp: "store",
      clearDepth: 1.0
    }
  };

  const vertexBufferData = new Float32Array([-0.01, -0.02, 0.01, -0.02, 0.00, 0.02]);
  const verticesBuffer = device.createBuffer({
    size: vertexBufferData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.TRANSFER_DST,
  });
  verticesBuffer.setSubData(0, vertexBufferData);

  const simParamData = new Float32Array(numLinks * 2);
  const lineBufferData = new Float32Array(numLinks * 4);

  for (let i = 0; i < numLinks; i++) {
    let link = links[i] || {id1: 0, id2: 1};
    let id1 = link.id1;
    let id2 = link.id2;
    let n1 = nodes[id1];
    let n2 = nodes[id2];

    simParamData[2 * i + 0] = id1;
    simParamData[2 * i + 1] = id2;

    lineBufferData[4 * i + 0] = n1.x;
    lineBufferData[4 * i + 1] = n1.y;
    lineBufferData[4 * i + 2] = n2.x;
    lineBufferData[4 * i + 3] = n2.y;
  }
  const simParamBuffer = device.createBuffer({
    size: simParamData.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.STORAGE,
  });
  simParamBuffer.setSubData(0, simParamData);

  const lineBuffer = device.createBuffer({
    size: lineBufferData.byteLength,
    usage: GPUBufferUsage.TRANSFER_DST | GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE,
  });
  lineBuffer.setSubData(0, lineBufferData);

  const initialParticleData = new Float32Array(numNodes * 2);
  for (let i = 0; i < numNodes; i++) {
    initialParticleData[2 * i + 0] = Math.random() * 600 + 300;
    initialParticleData[2 * i + 1] = Math.random() * 600 + 300;
  }


  const particleBuffers = new Array(2);
  const particleBindGroups = new Array(2);
  for (let i = 0; i < 2; ++i) {
    particleBuffers[i] = device.createBuffer({
      size: initialParticleData.byteLength,
      usage: GPUBufferUsage.TRANSFER_DST | GPUBufferUsage.VERTEX | GPUBufferUsage.STORAGE
    });
    particleBuffers[i].setSubData(0, initialParticleData);
  }
  for (let i = 0; i < 2; ++i) {
    particleBindGroups[i] = device.createBindGroup({
      layout: computeBindGroupLayout,
      bindings: [{
        binding: 0,
        resource: {
          buffer: simParamBuffer,
          offset: 0,
          size: simParamData.byteLength
        },
      }, {
        binding: 1,
        resource: {
          buffer: particleBuffers[i],
          offset: 0,
          size: initialParticleData.byteLength,
        },
      }, {
        binding: 2,
        resource: {
          buffer: particleBuffers[(i + 1) % 2],
          offset: 0,
          size: initialParticleData.byteLength,
        },
      }],
    });
  }

  let t = 0;
  function frame() {
    renderPassDescriptor.colorAttachments[0].attachment = swapChain.getCurrentTexture().createDefaultView();

    const commandEncoder = device.createCommandEncoder({});
    {
      const passEncoder = commandEncoder.beginComputePass();
      passEncoder.setPipeline(computePipeline);
      passEncoder.setBindGroup(0, particleBindGroups[t % 2]);
      passEncoder.dispatch(numNodes);
      passEncoder.endPass();
    }
    {
      const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
      passEncoder.setPipeline(renderPipeline);
      passEncoder.setVertexBuffers(0, [simParamBuffer, particleBuffers[(t + 1) % 2], verticesBuffer], [0, 0, 0]);
      passEncoder.draw(6, numNodes, 0, 0);
      passEncoder.endPass();
    }
    device.getQueue().submit([commandEncoder.finish()]);

    ++t;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

const request = async (shader) => {
  const response = await fetch(`./shaders/${shader}`);
  return await response.text();
}

init();
