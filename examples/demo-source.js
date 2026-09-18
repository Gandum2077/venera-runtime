// Venera 配置源码：由运行时读取执行，不要直接 import 或 require 本文件。
class DemoSource extends ComicSource {
  name = "Local demo";
  key = "local_demo";
  version = "1.0.0";

  async init() {
    this.saveData("initialized", true);
  }

  search = {
    load: async (keyword) => ({
      comics: [new Comic({ id: "demo-1", title: keyword, cover: "" })],
      maxPage: 1,
    }),
  };
}
