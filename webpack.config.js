const path = require('path');
const CleanWebpackPlugin = require('clean-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  entry: './src/index.js',
  plugins: [
    new CleanWebpackPlugin(),
    new HtmlWebpackPlugin({
      template: 'public/index.html',
    }),
  ],
  output: {
    filename: '[name].[contenthash].js',
    path: path.resolve(__dirname, 'dist')
  },
  devtool: 'eval-source-map',
  module: {
    rules: [
      {
        test: /\.(png|svg|jpg|gif|mp3)$/,
        use: [
          'file-loader'
        ]
      },
      {
        test: /\.js$/,
        exclude: /node_modules/, // this doesn't properly exclude packages from the other workspaces
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              ['@babel/preset-env', {
                targets: '> 2.5%',
              }],
            ],
          },
        },
      },
    ],
  },
};
