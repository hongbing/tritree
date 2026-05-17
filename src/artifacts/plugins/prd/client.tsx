import { PrdRenderer } from "./PrdRenderer";
import { prdManifest } from "./manifest";

export const prdClientPlugin = {
  manifest: {
    ...prdManifest,
    rendererKey: "prd/default"
  },
  renderers: {
    "prd/default": PrdRenderer
  }
};
