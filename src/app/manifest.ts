import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Launchpad Job Finder",
    short_name: "Launchpad",
    description: "Private job discovery and application preparation",
    start_url: "/",
    display: "standalone",
    background_color: "#101310",
    theme_color: "#224b3b",
    icons: [{ src: "/launchpad.svg", sizes: "any", type: "image/svg+xml" }],
    share_target: {
      action: "/share",
      method: "GET",
      enctype: "application/x-www-form-urlencoded",
      params: { title: "title", text: "text", url: "url" },
    },
  };
}
