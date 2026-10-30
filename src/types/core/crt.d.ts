export interface ActivePlayerShader {
  shader: string;
  path: string;
}

export interface PlayerShaderTarget {
  shader: string | null;
  path: string | null;
  params: Record<string, number>;
}

export interface MpvCommand {
  name: string;
  args: string[];
}
