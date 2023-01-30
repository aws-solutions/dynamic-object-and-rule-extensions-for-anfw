/* eslint-disable */
const path = require('path');

module.exports = {
    // Loads the entry object from the AWS::Serverless::Function resources in your
    // template.yaml or template.yml
    entry: {
        handler: './src/handler.ts',
    },

    // Write the output to the .aws-sam/build folder
    output: {
        filename: '[name]/index.js',
        libraryTarget: 'commonjs2',
        path: __dirname + '/build/',
    },

    // Create source maps
    devtool: 'source-map',

    // Resolve .ts and .js extensions
    resolve: {
        alias: {
            src: path.resolve(__dirname, './src'),
        },
        extensions: ['.ts', '.js'],
    },

    // Target node
    target: 'node',

    // Set the webpack mode
    mode: process.env.NODE_ENV || 'production',

    // Add the TypeScript loader
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                loader: 'ts-loader',
            },
        ],
    },
    externals: {
        'aws-sdk': 'aws-sdk',
        SyntheticsLogger: 'SyntheticsLogger',
        Synthetics: 'Synthetics',
    },
};
