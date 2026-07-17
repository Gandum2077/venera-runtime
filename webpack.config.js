const path = require("path");
const MinimizerPlugin = require("minimizer-webpack-plugin");

module.exports = (env = {}) => {
  const debug = env.debug === true || env.debug === "true";

  return {
    mode: debug ? "development" : "production",
    devtool: false,
    entry: "./dist/index.js", // 入口文件
    output: {
      path: path.resolve(__dirname, "app"),
      filename: "main.js",
    },
    optimization: {
      minimize: !debug,
      minimizer: [
        new MinimizerPlugin({
          extractComments: false,
        }),
      ],
    },
  };
};
