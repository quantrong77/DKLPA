/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./client/index.html', './client/src/**/*.{js,jsx}', '../client/**/*.{js,jsx}'],
  theme: {
    extend: {
      // bảng màu của ChatLan: giao diện module giữ nguyên như khi chạy trong ChatLan
      colors: {
        // chatlan 50–900 đọc biến CSS --chatlan-<n> (mặc định = màu ChatLan): module Chuẩn bị công tác đổi được giao diện
        // trong khung của nó mà không ảnh hưởng phần còn lại
        chatlan: {
          50: 'rgb(var(--chatlan-50, 240 246 255) / <alpha-value>)', 100: 'rgb(var(--chatlan-100, 224 237 255) / <alpha-value>)', 200: 'rgb(var(--chatlan-200, 185 219 254) / <alpha-value>)', 300: 'rgb(var(--chatlan-300, 124 190 253) / <alpha-value>)', 400: 'rgb(var(--chatlan-400, 54 156 251) / <alpha-value>)',
          500: 'rgb(var(--chatlan-500, 0 104 255) / <alpha-value>)', 600: 'rgb(var(--chatlan-600, 0 88 224) / <alpha-value>)', 700: 'rgb(var(--chatlan-700, 0 70 181) / <alpha-value>)', 800: 'rgb(var(--chatlan-800, 0 58 148) / <alpha-value>)', 900: 'rgb(var(--chatlan-900, 0 47 121) / <alpha-value>)',
          active: '#004fc4'
        }
      },
      fontFamily: {
        sans: ['Segoe UI', '-apple-system', 'BlinkMacSystemFont', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif']
      }
    }
  },
  plugins: []
};
