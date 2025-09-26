export function registerAllowedRootsTool(
  addTool: (name: string, schema: any, handler: (args: any) => any) => void,
  getRoots: () => string[]
) {
  addTool("aa.allowed_roots", {}, async () => {
    const result = getRoots();
    return { structuredContent: { result } };
  });
}
