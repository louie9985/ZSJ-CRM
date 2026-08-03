import type { UserConfigExport } from "@tarojs/cli";

const config: UserConfigExport = {
  mini: { minifyXML: {}, optimizeMainPackage: { enable: true } },
  h5: {
    esnextModules: ["@nutui/nutui-react-taro"],
    webpackChain(chain) {
      chain.resolve.set("fullySpecified", false);
      chain.resolve.alias.set("@tarojs/plugin-platform-h5/dist/runtime$", "@tarojs/plugin-platform-h5/dist/runtime/index.js");
      chain.resolve.alias.set("@tarojs/components/dist/components$", "@tarojs/components/dist/components/index.js");
    },
  },
};
export default config;
