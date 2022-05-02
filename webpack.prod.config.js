const path = require("path");
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = {
    mode:"production",
    target: "web",
    entry: {
        app: "./scripts/app.ts",
        dialog: "./scripts/dialog.tsx"
    },
    output: {
        filename: "scripts/[name].js",
        publicPath: "./dist",
        libraryTarget: "amd"
    },
    externals: [
        /^VSS\/.*/, /^TFS\/.*/, /^q$/
    ],
    resolve: {
        extensions: [".ts", ".tsx", ".js"],
        alias: {
            "OfficeFabric": path.resolve(__dirname, "node_modules/@fluentui/react/lib"),
            "vss-web-extension-sdk": path.resolve(__dirname, "node_modules/vss-web-extension-sdk/lib/VSS.SDK")
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
                test: /\.css$/,
                use: ["style-loader", "css-loader"]
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