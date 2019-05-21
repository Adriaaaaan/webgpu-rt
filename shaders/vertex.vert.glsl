#version 450
layout(location = 1) in vec2 a_particlePos;
layout(location = 0) out vec2 v_pos;

void main() {
  vec2 vertices[6] = vec2[6](
    vec2(-0.03f, -0.03f),
    vec2(0.03f, -0.03f),
    vec2(-0.03f, 0.03f),
    vec2(-0.03f, 0.03f),
    vec2(0.03f, -0.03f),
    vec2(0.03f, 0.03f)
  );
  v_pos = vertices[gl_VertexIndex % 6];

  vec2 clip = ((a_particlePos / 1200.0) * 2.0) - 1.0;
  gl_Position = vec4(vertices[gl_VertexIndex % 6] + clip * 2.0, 0, 1);
}