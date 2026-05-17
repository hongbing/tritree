import { prdPlugin } from "./server";
import { PrdRenderer } from "./PrdRenderer";

export const prdClientPlugin = {
  manifest: {
    capabilities: prdPlugin.capabilities,
    description: prdPlugin.description,
    id: prdPlugin.id,
    label: prdPlugin.label,
    rendererKey: "prd/default"
  },
  renderers: {
    "prd/default": PrdRenderer
  }
};
