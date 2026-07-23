import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./Home.jsx";
import HangoutPage from "./HangoutPage.jsx";
import Onboarding from "./Onboarding.jsx";
import { getProfile } from "./profile.js";
import "./styles.css";

function App() {
  // Only a real account counts — older device-only profiles go through signup.
  const [profile, setProfile] = useState(() => {
    const p = getProfile();
    return p?.email && p?.token ? p : null;
  });

  // First launch → tutorial, then create account / log in. Applies everywhere,
  // including shared hangout links.
  if (!profile) return <Onboarding onDone={setProfile} />;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home profile={profile} onResetProfile={() => setProfile(null)} />} />
        <Route path="/h/:id" element={<HangoutPage profile={profile} />} />
      </Routes>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
