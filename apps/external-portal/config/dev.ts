import type { UserConfigExport } from "@tarojs/cli";

const config: UserConfigExport = {
  env: { NODE_ENV: '"development"' },
  h5: {
    devServer: { historyApiFallback: true },
    webpackChain(chain) {
      chain.resolve.set("fullySpecified", false);
      chain.resolve.alias.set("@tarojs/plugin-platform-h5/dist/runtime$", "@tarojs/plugin-platform-h5/dist/runtime/index.js");
      chain.resolve.alias.set("@tarojs/components/dist/components$", "@tarojs/components/dist/components/index.js");
    },
  },
};
export default config;
