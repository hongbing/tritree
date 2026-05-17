import { SocialPostRenderer } from "./SocialPostRenderer";
import { socialPostManifest } from "./manifest";

export const socialPostClientPlugin = {
  manifest: {
    ...socialPostManifest,
    rendererKey: "social-post/default"
  },
  renderers: {
    "social-post/default": SocialPostRenderer
  }
};
