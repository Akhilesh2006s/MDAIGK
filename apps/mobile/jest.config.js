const path = require('path');

module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '^@mango/shared$': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};
