import { Link } from 'react-router-dom';
import { usePageTitle } from '../ui';

export function NotFound() {
  usePageTitle('Page not found');
  return (
    <div className="container page narrow">
      <div className="panel">
        <h1>Page not found</h1>
        <p>The page you asked for does not exist or has moved.</p>
        <div className="row">
          <Link className="btn btn-primary" to="/">Report an issue</Link>
          <Link className="btn btn-secondary" to="/track">Track a complaint</Link>
        </div>
      </div>
    </div>
  );
}

export function Privacy() {
  usePageTitle('Privacy policy');
  return (
    <div className="container page narrow prose">
      <h1>Privacy policy</h1>
      <p className="muted">CivicSaathi AI is a hackathon prototype. This policy describes what the prototype actually does.</p>
      <h2>What we store</h2>
      <ul>
        <li>The photo you upload, saved on the server with a random file name.</li>
        <li>The issue category, severity, locality you typed, matched ward and department, optional details, status and timestamps.</li>
        <li>A short log of tool calls (tool name, summary, duration, outcome) linked to a random session ID kept in your browser.</li>
        <li>Standard server request logs: time, method, path, status code. These do not include photos or complaint text.</li>
      </ul>
      <p>We do not ask for your name, phone number or email. Please do not type personal details into the optional details box or take photos that show faces or number plates.</p>
      <h2>How photos are processed</h2>
      <p>When the server is configured with a Gemini API key, your photo is sent to Google's Gemini API to identify the likely issue. Without a key, the app runs in demo mode and no photo is sent to any third party. The app always shows which mode was used.</p>
      <h2>No filing with the AMC</h2>
      <p>Complaints created here stay in this prototype's database. They are not submitted to the Ahmedabad Municipal Corporation or any other authority, and this project is not affiliated with them.</p>
      <h2>Retention and deletion</h2>
      <p>The prototype has no retention schedule and no account system. Data may be deleted or reset at any time without notice.</p>
      <h2>Contact</h2>
      <p>For questions or removal requests, open an issue in the project's public source repository and quote the tracking ID only.</p>
    </div>
  );
}

export function Terms() {
  usePageTitle('Terms and conditions');
  return (
    <div className="container page narrow prose">
      <h1>Terms and conditions</h1>
      <p className="muted">Please read these terms before using this prototype.</p>
      <h2>Purpose</h2>
      <p>CivicSaathi AI demonstrates how an AI agent could help residents of Ahmedabad report civic issues. It is a prototype built for a hackathon and is not an official service.</p>
      <h2>No official status</h2>
      <p>The project is independent. It is not operated by, endorsed by or connected to the Ahmedabad Municipal Corporation. Creating a record here does not register a complaint with any government body, and no action by any authority should be expected.</p>
      <h2>Demonstration data</h2>
      <p>Localities, wards, zones, departments and sample complaints are illustrative demonstration data. Ward codes are internal identifiers. They are not an official directory and may be incorrect or out of date. Records labelled Demonstration are not real complaints.</p>
      <h2>AI limitations</h2>
      <p>Image analysis can be wrong. You are asked to confirm the issue category and routing before a record is created. In demo mode, analysis is simulated.</p>
      <h2>Acceptable use</h2>
      <p>Upload only photos of public civic issues that you are entitled to share. Do not upload unlawful, abusive or personal content, and do not attempt to disrupt the service.</p>
      <h2>No warranty</h2>
      <p>The prototype is provided as is, without guarantees of availability, accuracy or data retention. For emergencies or urgent public safety hazards, contact the relevant authorities directly.</p>
      <p>See also the <Link to="/privacy">privacy policy</Link>.</p>
    </div>
  );
}
