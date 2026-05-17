import { socialPostPlugin } from "./server";
import { SocialPostRenderer } from "./SocialPostRenderer";

export const socialPostClientPlugin = {
  manifest: {
    capabilities: socialPostPlugin.capabilities,
    description: socialPostPlugin.description,
    id: socialPostPlugin.id,
    label: socialPostPlugin.label,
    rendererKey: "social-post/default"
  },
  renderers: {
    "social-post/default": SocialPostRenderer
  }
};
