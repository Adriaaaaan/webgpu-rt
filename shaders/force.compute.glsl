#version 450
struct Particle {
vec2 pos;
};

layout(std140, set = 0, binding = 0) buffer SimParams {
vec2 links[24];
} params;

layout(std140, set = 0, binding = 1) buffer ParticlesA {
Particle particles[${numNodes}];
} particlesA;

layout(std140, set = 0, binding = 2) buffer ParticlesB {
Particle particles[${numNodes}];
} particlesB;


  float replulsion(vec2 xi, vec2 xj, float c, float k) {
    return -c * (k * k) / distance(xi, xj);
  }

  float attraction(vec2 xi, vec2 xj, float k) {
    return ((xj.x - xi.x) * (xj.x - xi.x) + (xj.y - xi.y) * (xj.y - xi.y)) / k;
  }

void main() {
// https://github.com/austinEng/Project6-Vulkan-Flocking/blob/master/data/shaders/computeparticles/particle.comp

uint index = gl_GlobalInvocationID.x;
if (index >= ${numNodes}) { return; }

vec2 xi = particlesA.particles[index].pos;

vec2 cMass = vec2(0.0, 0.0);
int cMassCount = 0;
float springLength = 100.0f;
float step = 1.0;
float c = 2.0;
float k = 25.0;
vec2 xj;
vec2 f = vec2(0.0);
for (int i = 0; i < ${numNodes}; i++) {
    if (i == index) { continue; }
    xj = particlesA.particles[i].pos.xy;
    float force = replulsion(xi, xj, c, k) / distance(xi, xj);
    f += force * normalize(xj - xi);
}

for (int i = 0; i < 14; i++) {
  uint id1 = uint(params.links[i].x);
  uint id2 = uint(params.links[i].y);
  vec2 xl;
  if (index == id1 || index == id2) {
    if (index == id1) {
      xl = particlesA.particles[id2].pos.xy;
    }
    if (index == id2) {
      xl = particlesA.particles[id1].pos.xy;
    }

    float dist = distance(xi.xy, xl.xy);
    float force = attraction(xi.xy, xl.xy, 200.0 ) / dist;
    f.x += force * (xl.x - xi.x);
    f.y += force * (xl.y - xi.y);
  }
}
vec2 singularity = vec2(600.0);
float dist = distance(xi, singularity);
float force = attraction(xi, singularity, k) / sqrt(dist*dist);
//f.x -= force * (xi.x - singularity.x) * 0.004;
//f.y -= force * (xi.y - singularity.y) * 0.004;


  float stepX = step * (f.x / sqrt(f.x * f.x + f.y * f.y));
  float stepY = step * (f.y / sqrt(f.x * f.x + f.y * f.y));
  xi.x += stepX;
  xi.y += stepY;



  particlesB.particles[index].pos = xi;
  }