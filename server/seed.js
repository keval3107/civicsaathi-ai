// ILLUSTRATIVE DEMONSTRATION DATA ONLY.
// This is not an official or current AMC (Ahmedabad Municipal Corporation) directory.
// Ward names, zone assignments and ward codes below are simplified samples for a prototype.
// Ward codes (W01...) are internal demo identifiers, not official ward numbers.

export const DATASET_NOTICE =
  'Illustrative demonstration data. Not an official AMC directory. Ward codes are internal demo identifiers.';

export const CATEGORIES = {
  pothole: { label: 'Pothole', ruleId: 'RULE-ROAD-01' },
  garbage: { label: 'Garbage accumulation', ruleId: 'RULE-SWM-01' },
  broken_streetlight: { label: 'Broken streetlight', ruleId: 'RULE-ELEC-01' },
  waterlogging: { label: 'Waterlogging', ruleId: 'RULE-DRAIN-01' },
};

export const SEVERITIES = ['low', 'medium', 'high'];
export const STATUSES = ['submitted', 'acknowledged', 'in_progress', 'resolved'];

export const DEPARTMENTS = {
  pothole: { id: 'DEPT-ROADS', name: 'Roads and Building Department' },
  garbage: { id: 'DEPT-SWM', name: 'Solid Waste Management Department' },
  broken_streetlight: { id: 'DEPT-ELEC', name: 'Electrical (Street Lighting) Department' },
  waterlogging: { id: 'DEPT-DRAIN', name: 'Storm Water Drainage Department' },
};

export const WARDS = [
  { id: 'W01', name: 'Navrangpura', zone: 'West Zone' },
  { id: 'W02', name: 'Vastrapur', zone: 'West Zone' },
  { id: 'W03', name: 'Bodakdev', zone: 'West Zone' },
  { id: 'W04', name: 'Thaltej', zone: 'West Zone' },
  { id: 'W05', name: 'Jodhpur', zone: 'West Zone' },
  { id: 'W06', name: 'Paldi', zone: 'West Zone' },
  { id: 'W07', name: 'Ellisbridge', zone: 'West Zone' },
  { id: 'W08', name: 'Maninagar', zone: 'South Zone' },
  { id: 'W09', name: 'Vatva', zone: 'South Zone' },
  { id: 'W10', name: 'Naroda', zone: 'North Zone' },
  { id: 'W11', name: 'Bapunagar', zone: 'East Zone' },
  { id: 'W12', name: 'Gota', zone: 'New West Zone' },
  { id: 'W13', name: 'Chandkheda', zone: 'New West Zone' },
  { id: 'W14', name: 'Naranpura', zone: 'West Zone' },
  { id: 'W15', name: 'Ghatlodiya', zone: 'New West Zone' },
  { id: 'W16', name: 'Sabarmati', zone: 'New West Zone' },
  { id: 'W17', name: 'Bopal', zone: 'South West Zone' },
];

// Each locality maps to one ward, or to several candidate wards (ambiguous: user must be more specific).
export const LOCALITIES = [
  { name: 'Navrangpura', aliases: ['navarangpura'], wardIds: ['W01'] },
  { name: 'Vastrapur', aliases: ['vastrapur lake'], wardIds: ['W02'] },
  { name: 'Bodakdev', aliases: ['bodak dev'], wardIds: ['W03'] },
  { name: 'Thaltej', aliases: [], wardIds: ['W04'] },
  { name: 'Satellite', aliases: ['satellite road', 'jodhpur char rasta', 'jodhpur'], wardIds: ['W05'] },
  { name: 'Paldi', aliases: [], wardIds: ['W06'] },
  { name: 'Ellisbridge', aliases: ['ellis bridge'], wardIds: ['W07'] },
  { name: 'Maninagar', aliases: ['mani nagar'], wardIds: ['W08'] },
  { name: 'Vatva', aliases: [], wardIds: ['W09'] },
  { name: 'Naroda', aliases: [], wardIds: ['W10'] },
  { name: 'Bapunagar', aliases: ['bapu nagar'], wardIds: ['W11'] },
  { name: 'Gota', aliases: [], wardIds: ['W12'] },
  { name: 'Chandkheda', aliases: ['chandkheda gam'], wardIds: ['W13'] },
  { name: 'Naranpura', aliases: [], wardIds: ['W14'] },
  { name: 'Ghatlodiya', aliases: ['ghatlodia'], wardIds: ['W15'] },
  { name: 'Sabarmati', aliases: [], wardIds: ['W16'] },
  { name: 'Bopal', aliases: ['south bopal'], wardIds: ['W17'] },
  // Long roads that cross wards: intentionally ambiguous.
  { name: 'SG Highway', aliases: ['sarkhej gandhinagar highway', 's g highway'], wardIds: ['W02', 'W03', 'W04'] },
  { name: 'Ashram Road', aliases: [], wardIds: ['W01', 'W07'] },
];

// Demonstration complaints. Dates are offsets in hours before first startup.
export const DEMO_COMPLAINTS = [
  { id: 'DEMO-1001', category: 'pothole', severity: 'high', locality: 'Navrangpura', wardId: 'W01', status: 'in_progress', hoursAgo: 96, note: 'Demonstration record' },
  { id: 'DEMO-1002', category: 'garbage', severity: 'medium', locality: 'Maninagar', wardId: 'W08', status: 'acknowledged', hoursAgo: 52, note: 'Demonstration record' },
  { id: 'DEMO-1003', category: 'broken_streetlight', severity: 'medium', locality: 'Vastrapur', wardId: 'W02', status: 'submitted', hoursAgo: 20, note: 'Demonstration record' },
  { id: 'DEMO-1004', category: 'waterlogging', severity: 'high', locality: 'Naroda', wardId: 'W10', status: 'resolved', hoursAgo: 200, note: 'Demonstration record' },
  { id: 'DEMO-1005', category: 'pothole', severity: 'low', locality: 'Bopal', wardId: 'W17', status: 'submitted', hoursAgo: 8, note: 'Demonstration record' },
  { id: 'DEMO-1006', category: 'garbage', severity: 'high', locality: 'Bapunagar', wardId: 'W11', status: 'in_progress', hoursAgo: 120, note: 'Demonstration record' },
];

export const STATUS_EXPLANATIONS = {
  submitted: {
    label: 'Submitted',
    text: 'The complaint is recorded in this prototype and waiting for the next step.',
    next: 'No further action is needed. Check again later with the same tracking ID.',
  },
  acknowledged: {
    label: 'Acknowledged',
    text: 'The responsible department has noted the complaint.',
    next: 'Work has not started yet. The next stage is "In progress".',
  },
  in_progress: {
    label: 'In progress',
    text: 'The complaint has been assigned and work is under way.',
    next: 'The next stage is "Resolved" once the work is complete.',
  },
  resolved: {
    label: 'Resolved',
    text: 'The complaint is marked as completed.',
    next: 'If the problem persists, file a new report.',
  },
};
