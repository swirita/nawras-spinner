import { defineConfig } from 'vite';

// origin: https://github.com/swirita/nawras-spinner.git
// Pages builds and previews use the repository subpath; development stays at /.
export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE_PATH || (mode === 'production' ? '/nawras-spinner/' : '/'),
}));
