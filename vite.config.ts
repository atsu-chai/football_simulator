import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 相対パスで出力し、GitHub Pages のサブパス(/football_simulator/)でもそのまま動くようにする
export default defineConfig({ base: './', plugins: [react()] });
