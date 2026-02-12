const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = {
  entry: {
    'background/index': './src/background/index.js',
    'content/amazon': './src/content/amazon.js',
    'content/reddit': './src/content/reddit.js',
    'content/googlemaps': './src/content/googlemaps.js',
    'content/universal': './src/content/universal.js',
    'popup/popup': './src/popup/popup.js',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader'],
      },
    ],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'public', to: '.' },
        { from: 'src/popup/popup.html', to: 'popup/popup.html' },
        { from: 'src/popup/options.html', to: 'popup/options.html' },
        { from: 'src/content/overlay.css', to: 'content/overlay.css' },
        { from: 'src/assets', to: 'assets' },
      ],
    }),
    new MiniCssExtractPlugin(),
  ],
  resolve: {
    extensions: ['.js'],
  },
};
