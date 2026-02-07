module.exports = {
  env: {
    browser: true,
    node: true,
    es2022: true
  },
  extends: ["eslint:recommended", "plugin:security/recommended"],
  plugins: ["security"],
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module"
  },
  ignorePatterns: ["dist", "build", "node_modules"]
};
