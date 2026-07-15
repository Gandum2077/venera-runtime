enum ENV {
  NODE = 0,
  JSBOX = 1,
}

let env: ENV;
if (
  (typeof process !== "undefined" && process.versions && process.versions.node > "17.5") ||
  typeof fetch !== "undefined"
) {
  env = ENV.NODE;
} else if (typeof $http !== "undefined" && $http.request !== undefined) {
  env = ENV.JSBOX;
} else {
  throw new Error("Unsupported environment. This library can only run in Node.js or JSBox.");
}