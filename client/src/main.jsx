import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";

// Every screen change starts at the top of the page
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
import Home from "./Home.jsx";
import HangoutPage from "./HangoutPage.jsx";
import Onboarding from "./Onboarding.jsx";
import SquadPage from "./Squads.jsx";
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
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Home profile={profile} onResetProfile={() => setProfile(null)} />} />
        <Route path="/h/:id" element={<HangoutPage profile={profile} />} />
        <Route path="/squad/:id" element={<SquadPage />} />
      </Routes>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
