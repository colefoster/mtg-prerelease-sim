import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { SetPicker } from "./pages/SetPicker";
import { SetBrowser } from "./pages/SetBrowser";
import { OpenPage } from "./pages/OpenPage";
import { BuildPage } from "./pages/BuildPage";

const router = createBrowserRouter([
  { path: "/", element: <SetPicker /> },
  { path: "/set/:setCode", element: <SetBrowser /> },
  { path: "/open/:setCode", element: <OpenPage /> },
  { path: "/build/:setCode", element: <BuildPage /> },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
