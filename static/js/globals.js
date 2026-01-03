// Shared Global State
var currentRepo = null; // Used for navigation
var selectedTasks = new Set(['mmlu']);
var isRunning = false;
var availableTasks = [];
var activeLogFilename = null;

// The Cart
var batchQueue = []; // Array of {repo_id, filename, tags, size}