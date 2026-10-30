import { isValidElement, type ReactNode } from "react";

const elementTypeName = (type: unknown): string => {
  if (typeof type === "string") return type;
  if (typeof type !== "object" && typeof type !== "function") return "Component";
  if (type === null) return "Component";
  if ("displayName" in type && typeof type.displayName === "string") return type.displayName;
  if ("name" in type && typeof type.name === "string") return type.name;
  return "Component";
};

export const getContentSignature = (node: ReactNode): string => {
  if (node === null || node === undefined || typeof node === "boolean") {
    return "";
  }
  if (typeof node === "string" || typeof node === "number") return "#text";
  if (Array.isArray(node)) return `[${node.map(getContentSignature).join(",")}]`;
  if (isValidElement<{ children?: ReactNode }>(node)) {
    const type = elementTypeName(node.type);
    return `<${type}#${node.key ?? ""}>${getContentSignature(node.props.children)}</${type}>`;
  }
  return "#opaque";
};
