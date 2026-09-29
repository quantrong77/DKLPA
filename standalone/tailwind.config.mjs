/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./client/index.html', './client/src/**/*.{js,jsx}', '../client/**/*.{js,jsx}'],
  theme: {
    extend: {
      // bảng màu của ChatLan: giao diện module giữ nguyên như khi chạy trong ChatLan
      colors: {
        chatlan: {
          50: '#f0f6ff', 100: '#e0edff', 200: '#b9dbfe', 300: '#7cbefd', 400: '#369cfb',
          500: '#0068FF', 600: '#0058e0', 700: '#0046b5', 800: '#003a94', 900: '#002f79',
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
