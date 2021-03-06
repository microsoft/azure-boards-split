const path = require("path");
const fs = require("fs");
// const webpack = require("webpack");
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = {
    mode: "development",
    target: "web",
    entry: {
        app: "./scripts/app.ts",
        dialog: "./scripts/dialog.tsx"
    },
    output: {
        filename: "scripts/[name].js",
        publicPath: "https://localhost:9091/dist",
        libraryTarget: "amd"
    },

    devServer: {
        https: true,
        port: 9090,
        open: true
    },
    externals: [
        /^VSS\/.*/, /^TFS\/.*/, /^q$/
    ],
    devtool: 'inline-source-map',
    resolve: {
        extensions: [".ts", ".tsx", ".js"],
        alias: {
            "VSSUI": path.resolve(__dirname, "node_modules/azure-devops-ui"),
            "vss-web-extension-sdk": path.resolve(__dirname, "node_modules/vss-web-extension-sdk/lib/VSS.SDK"),
            "platformCss": path.resolve(__dirname, "node_modules/azure-devops-ui/Core/_platformCommon.scss"),
        },
        modules: [path.resolve("."), "node_modules"]
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: "ts-loader"
            },
            {
                test: /\.scss$/,
                use: [
                    "style-loader",
                    "css-loader",
                    "azure-devops-ui/buildScripts/css-variables-loader",
                    "sass-loader"
                ]
            },
            {
                test: /\.css$/,
                use: ["style-loader", "css-loader"]
            },
            {
                test: /\.woff$/,
                use: [
                  {
                    loader: "base64-inline-loader"
                  }
                ]
              },
            {
                test: /\.(png|svg|jpg|gif|html)$/,
                use: "file-loader"
            }
        ]
    },
    plugins: [
        new CopyWebpackPlugin({
            patterns: [
                { from: "./node_modules/vss-web-extension-sdk/lib/VSS.SDK.min.js", to: "./scripts/VSS.SDK.min.js" },
                { from: "**/*.css", to: "./css", context: "css" },
                { from: "*.html", to: "./", context: "." },
                { from: "**/*.png", to: "./img", context: "img" },
                { from: "./azure-devops-extension.json", to: "azure-devops-extension.json" },
                { from: "./readme.md", to: "readme.md" }
            ]
        })
    ]
};