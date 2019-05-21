#version 450
layout(location = 0) out vec4 fragColor;
layout(location = 0) in vec2 v_pos;

void main() {
  if (length(v_pos) > 0.03f) discard;
  fragColor = vec4(0.0,1.0,0.0,1.0);
}