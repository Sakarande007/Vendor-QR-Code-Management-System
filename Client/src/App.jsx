import { QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./context/AuthContext.jsx";
import { AppProvider } from "./context/AppContext.jsx";
import { ToastContainer } from "./components/ToastContainer.jsx";
import { AppRouter } from "./router/AppRouter.jsx";
import { queryClient } from "./lib/queryClient.js";
import "./App.css";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AppProvider>
          <ToastContainer />
          <AppRouter />
        </AppProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
