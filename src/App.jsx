import React, { useState, useEffect } from 'react';
import { initializeApp } from "firebase/app";
import { 
  getFirestore, 
  collection, 
  query, 
  writeBatch, 
  doc,
  deleteDoc,
  onSnapshot
} from 'firebase/firestore';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged,
  signInWithCustomToken
} from 'firebase/auth';
import { 
  Search, 
  Calendar, 
  Database, 
  Upload, 
  Trash2, 
  Layers,
  Sparkles,
  HelpCircle,
  BookOpen,
  AlertCircle
} from 'lucide-react';

/* -------------------------------------------------------------------------- */
/* FIREBASE SETUP                                                             */
/* -------------------------------------------------------------------------- */

let firebaseConfig;
let appId = 'default-app-id';

// 1. Check for Vite Environment Variables (For your Render.com deployment)
try {
  // We check for import.meta.env safely
  if (import.meta.env && import.meta.env.VITE_FIREBASE_API_KEY) {
    firebaseConfig = {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID
    };
    appId = import.meta.env.VITE_FIREBASE_APP_ID || 'default-app-id';
  }
} catch (e) {
  // Ignore errors if import.meta is not defined in this environment
}

// 2. Fallback to Preview Environment (For this chat window)
if (!firebaseConfig && typeof __firebase_config !== 'undefined') {
  firebaseConfig = JSON.parse(__firebase_config);
  if (typeof __app_id !== 'undefined') appId = __app_id;
}

// Initialize Firebase
const app = initializeApp(firebaseConfig || {});
const auth = getAuth(app);
const db = getFirestore(app);

/* -------------------------------------------------------------------------- */
/* UTILITIES                                                                  */
/* -------------------------------------------------------------------------- */

const MONTHS = [
  "January", "February", "March", "April", "May", "June", 
  "July", "August", "September", "October", "November", "December"
];

const getMonthIndex = (monthStr) => {
  if (!monthStr) return -1;
  return MONTHS.findIndex(m => m.toLowerCase() === monthStr.toLowerCase());
};

const parseCSV = (text) => {
  const lines = text.split('\n');
  const issues = [];
  
  for (let i = 0; i < lines.length; i++) {
    // Robust CSV split
    const row = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(s => s.trim().replace(/^"|"$/g, ''));

    // Dynamic Anchor Search for Month/Year
    let monthIndex = -1;
    let foundMonthStr = "";
    
    for (let j = 0; j < 15 && j < row.length - 1; j++) {
      const cell = row[j];
      const matchMonth = MONTHS.find(m => m.toLowerCase() === cell.toLowerCase());
      
      if (matchMonth) {
         const potentialYear = parseInt(row[j+1]);
         if (!isNaN(potentialYear) && potentialYear > 1900 && potentialYear < 2100) {
            monthIndex = j;
            foundMonthStr = matchMonth;
            break;
         }
      }
    }

    if (monthIndex === -1) continue;

    const month = foundMonthStr;
    const year = parseInt(row[monthIndex + 1]);

    // Scan for issues
    let col = monthIndex + 2;
    
    while (col < row.length) {
      const val = row[col];
      
      if (val) {
        const collectionName = row[col + 1] || "";
        const format = row[col + 2] || "";
        const isUncollected = !collectionName;
        
        issues.push({
          month,
          year,
          issueNumber: val,
          collection: isUncollected ? "Uncollected / Single Issue" : collectionName,
          format: isUncollected ? "Not Printed" : (format || "Unknown"),
          isUncollected: isUncollected,
          searchIndex: `${month} ${year} ${val} ${collectionName || ''} ${format || ''} ${isUncollected ? 'uncollected missing' : ''}`.toLowerCase()
        });
        
        col += 3;
      } else {
        col++;
      }
    }
  }
  return issues;
};

/* -------------------------------------------------------------------------- */
/* COMPONENTS                                                                 */
/* -------------------------------------------------------------------------- */

const CerebroLoader = () => (
  <div className="flex flex-col items-center justify-center p-8 space-y-4 animate-pulse">
    <div className="relative w-24 h-24 rounded-full border-4 border-blue-500 flex items-center justify-center shadow-[0_0_20px_rgba(59,130,246,0.5)]">
      <div className="w-20 h-20 rounded-full border-2 border-yellow-400 opacity-75"></div>
      <div className="absolute w-full h-[1px] bg-blue-500/50 animate-spin-slow"></div>
      <div className="absolute w-[1px] h-full bg-blue-500/50 animate-spin-slow"></div>
    </div>
    <div className="text-blue-300 font-mono tracking-widest text-sm uppercase">Accessing Cerebro...</div>
  </div>
);

const IssueCard = ({ issue }) => {
  const getFormatStyle = (fmt, isUncollected) => {
    if (isUncollected) return {
      badge: 'bg-red-500/20 text-red-300 border-red-500/50',
      border: 'border-red-900/50 hover:border-red-500',
      accent: 'from-red-900 via-red-600 to-red-900',
      glow: 'hover:shadow-[0_0_20px_rgba(239,68,68,0.3)]',
      bg: 'bg-slate-900'
    };
    
    const f = fmt.toLowerCase();
    if (f.includes('omnibus')) return {
      badge: 'bg-yellow-500 text-black border-yellow-300',
      border: 'border-slate-700 hover:border-yellow-400',
      accent: 'from-yellow-500/50 via-blue-600/50 to-yellow-500/50',
      glow: 'hover:shadow-[0_0_20px_rgba(234,179,8,0.3)]',
      bg: 'bg-slate-900'
    };
    
    if (f.includes('ohc')) return {
      badge: 'bg-blue-600 text-white border-blue-400',
      border: 'border-slate-700 hover:border-blue-400',
      accent: 'from-blue-600/50 via-cyan-400/50 to-blue-600/50',
      glow: 'hover:shadow-[0_0_20px_rgba(59,130,246,0.3)]',
      bg: 'bg-slate-900'
    };
    
    return {
      badge: 'bg-green-600 text-white border-green-400',
      border: 'border-slate-700 hover:border-green-400',
      accent: 'from-green-600/50 via-emerald-400/50 to-green-600/50',
      glow: 'hover:shadow-[0_0_20px_rgba(34,197,94,0.3)]',
      bg: 'bg-slate-900'
    };
  };

  const style = getFormatStyle(issue.format, issue.isUncollected);

  return (
    <div className={`group relative flex-shrink-0 w-64 border rounded-lg overflow-hidden transition-all duration-300 ${style.bg} ${style.border} ${style.glow}`}>
      <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${style.accent}`}></div>
      <div className="p-4 space-y-2 h-full flex flex-col">
        <div className="flex justify-between items-start">
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${style.badge}`}>
            {issue.format}
          </span>
          <span className="text-slate-400 text-xs font-mono">{issue.month} {issue.year}</span>
        </div>
        <h3 className={`font-bold leading-tight line-clamp-2 min-h-[3rem] ${issue.isUncollected ? 'text-red-300 italic' : 'text-white'}`}>
          {issue.collection}
        </h3>
        <div className="mt-auto pt-2 flex items-center space-x-2">
          <div className={`h-8 w-8 rounded-full bg-slate-800 flex items-center justify-center border text-sm font-bold ${issue.isUncollected ? 'border-red-500/50 text-red-400' : 'border-slate-600 text-yellow-500'}`}>
            #{issue.issueNumber}
          </div>
          <span className="text-xs text-slate-400 uppercase tracking-wide">
            {issue.isUncollected ? 'Pending' : 'Issue'}
          </span>
        </div>
      </div>
      <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-4 text-center z-10">
        <div>
          <BookOpen className={`mx-auto mb-2 ${issue.isUncollected ? 'text-red-400' : 'text-yellow-500'}`} size={24} />
          <p className={`font-bold mb-1 uppercase text-xs tracking-widest ${issue.isUncollected ? 'text-red-400' : 'text-yellow-400'}`}>
            {issue.isUncollected ? 'Not Collected' : 'Locate in Collection'}
          </p>
          <p className="text-white text-sm font-medium">{issue.collection}</p>
          <p className="text-slate-400 text-xs mt-2">{issue.format}</p>
        </div>
      </div>
    </div>
  );
};

const TimelineSection = ({ title, issues }) => {
  if (issues.length === 0) return null;
  return (
    <div className="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <h2 className="text-xl md:text-2xl font-bold text-white mb-4 flex items-center">
        <span className="w-2 h-8 bg-yellow-500 mr-3 rounded-sm shadow-[0_0_10px_orange]"></span>
        {title}
      </h2>
      <div className="flex overflow-x-auto pb-6 space-x-4 px-2 scrollbar-thin scrollbar-thumb-blue-600 scrollbar-track-slate-800">
        {issues.map((issue, idx) => (
          <IssueCard key={`${issue.year}-${issue.month}-${issue.issueNumber}-${idx}`} issue={issue} />
        ))}
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* MAIN APP                                                                   */
/* -------------------------------------------------------------------------- */

function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('home'); 
  const [issues, setIssues] = useState([]); 
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [featuredIssues, setFeaturedIssues] = useState([]);
  const [featuredYear, setFeaturedYear] = useState(null);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);

  // Auth
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth error (falling back to anonymous):", error);
        try { await signInAnonymously(auth); } catch (e) { console.error(e); }
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // Data
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    setErrorMsg(null);
    
    try {
      // Use the STRICT path required by security rules: /artifacts/{appId}/public/data/{collectionName}
      // If we are on Render (custom keys), this path might need to be 'xmen_comics' at the root
      // if using your own Firebase. But for this preview, we must use the artifacts path.
      
      let collectionPath = collection(db, 'artifacts', appId, 'public', 'data', 'xmen_comics');
      
      // Heuristic: If we are using custom environment keys, use root collection
      if (import.meta.env && import.meta.env.VITE_FIREBASE_API_KEY) {
         collectionPath = collection(db, 'xmen_comics');
      }

      const q = query(collectionPath);
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedIssues = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        fetchedIssues.sort((a, b) => {
          if (a.year !== b.year) return a.year - b.year;
          return getMonthIndex(a.month) - getMonthIndex(b.month);
        });
        setIssues(fetchedIssues);
        setLoading(false);
      }, (err) => {
        console.error("Firestore error:", err);
        setErrorMsg("Access Denied: " + err.message);
        setLoading(false);
      });
      
      return () => unsubscribe();
    } catch (err) {
      console.error("Query setup error:", err);
      setErrorMsg("System Error: " + err.message);
      setLoading(false);
    }
  }, [user]);

  // Daily Feature
  useEffect(() => {
    if (issues.length === 0) return;
    const today = new Date();
    const currentMonthName = MONTHS[today.getMonth()]; 
    const start = new Date(today.getFullYear(), 0, 0);
    const diff = today - start;
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);
    const uniqueYears = [...new Set(issues.map(i => i.year))].sort();
    if (uniqueYears.length > 0) {
      const yearToFeature = uniqueYears[dayOfYear % uniqueYears.length];
      setFeaturedYear(yearToFeature);
      const todaysPicks = issues.filter(i => 
        i.month === currentMonthName && i.year === yearToFeature
      );
      setFeaturedIssues(todaysPicks);
    }
  }, [issues]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    const lowerQ = searchQuery.toLowerCase();
    
    if (/^\d{4}$/.test(lowerQ)) {
      setSearchResults(issues.filter(i => i.year === parseInt(lowerQ)));
      return;
    }

    setIsProcessingAI(true);
    try {
      // Use runtime variable for Gemini Key if available
      let apiKey = "";
      try {
        if (import.meta.env && import.meta.env.VITE_GEMINI_API_KEY) {
            apiKey = import.meta.env.VITE_GEMINI_API_KEY;
        }
      } catch (e) {}

      const prompt = `
        You are Cerebro. Convert query: "${searchQuery}" to JSON filter.
        Fields: year(num), month(str), text(str).
        Example: "1995 issues" -> {"year": 1995}
        Example: "Fall of X" -> {"text": "fall of x"}
        Example: "Uncollected" -> {"text": "uncollected"}
      `;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      const data = await response.json();
      const filter = JSON.parse(data.candidates[0].content.parts[0].text);

      let results = issues;
      if (filter.year) results = results.filter(i => i.year === filter.year);
      if (filter.month) results = results.filter(i => i.month.toLowerCase() === filter.month.toLowerCase());
      if (filter.text) results = results.filter(i => i.searchIndex.includes(filter.text.toLowerCase()));
      setSearchResults(results);
    } catch (err) {
      setSearchResults(issues.filter(i => i.searchIndex.includes(lowerQ)));
    } finally {
      setIsProcessingAI(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadStatus("Reading file...");
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        setUploadStatus("Scanning for timeline data...");
        const text = event.target.result;
        const parsedIssues = parseCSV(text);
        if (parsedIssues.length === 0) {
          setUploadStatus("Error: No valid issues found. Ensure CSV has Month/Year columns.");
          return;
        }
        setUploadStatus(`Found ${parsedIssues.length} issues. Uploading...`);
        
        let collectionPath = collection(db, 'artifacts', appId, 'public', 'data', 'xmen_comics');
        if (import.meta.env && import.meta.env.VITE_FIREBASE_API_KEY) {
             collectionPath = collection(db, 'xmen_comics');
        }

        const batchSize = 450;
        const chunks = [];
        for (let i = 0; i < parsedIssues.length; i += batchSize) {
          chunks.push(parsedIssues.slice(i, i + batchSize));
        }
        let count = 0;
        for (const chunk of chunks) {
          const batch = writeBatch(db);
          chunk.forEach(issue => {
            const docRef = doc(collectionPath);
            batch.set(docRef, issue);
          });
          await batch.commit();
          count += chunk.length;
          setUploadStatus(`Uploaded ${count} / ${parsedIssues.length}...`);
        }
        setUploadStatus("Database Synced Successfully.");
        setTimeout(() => {
            setUploadStatus(null);
            setActiveTab('home');
        }, 1500);
      } catch (err) {
        console.error(err);
        setUploadStatus("Error processing file: " + err.message);
      }
    };
    reader.readAsText(file);
  };

  const handleClearDatabase = async () => {
      if(!confirm("Warning: This will wipe Cerebro's memory.")) return;
      setUploadStatus("Clearing timeline...");
      try {
        let collectionPath = collection(db, 'artifacts', appId, 'public', 'data', 'xmen_comics');
        if (import.meta.env && import.meta.env.VITE_FIREBASE_API_KEY) {
             collectionPath = collection(db, 'xmen_comics');
        }

        const batchSize = 400;
        const chunks = [];
        for(let i=0; i<issues.length; i+= batchSize) {
            chunks.push(issues.slice(i, i+batchSize));
        }
        for (const chunk of chunks) {
            const batch = writeBatch(db);
            chunk.forEach(issue => {
                batch.delete(doc(collectionPath, issue.id));
            });
            await batch.commit();
        }
        setUploadStatus("Timeline reset.");
      } catch (err) {
        setUploadStatus("Delete failed: " + err.message);
      }
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <CerebroLoader />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-yellow-500 selection:text-black">
      <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab('home')}>
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-yellow-400 to-yellow-600 flex items-center justify-center shadow-lg shadow-yellow-500/20">
              <span className="text-black font-bold text-lg">X</span>
            </div>
            <span className="text-xl font-bold tracking-wider text-white">CEREBRO</span>
          </div>
          <nav className="flex items-center space-x-1">
            <button 
              onClick={() => setActiveTab('home')}
              className={`p-2 rounded-lg transition-colors ${activeTab === 'home' ? 'bg-slate-800 text-yellow-400' : 'hover:bg-slate-800'}`}
              title="Timeline"
            >
              <Layers size={20} />
            </button>
            <button 
              onClick={() => setActiveTab('database')}
              className={`p-2 rounded-lg transition-colors ${activeTab === 'database' ? 'bg-slate-800 text-yellow-400' : 'hover:bg-slate-800'}`}
              title="Database"
            >
              <Database size={20} />
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        
        {errorMsg && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-500/50 rounded-xl flex items-center space-x-3 text-red-200">
             <AlertCircle className="flex-shrink-0" />
             <span>{errorMsg}</span>
          </div>
        )}

        {activeTab === 'home' && (
          <div className="space-y-12">
            <div className="relative py-12 md:py-20 text-center space-y-6">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-900/10 via-slate-950 to-slate-950 pointer-events-none"></div>
              <h1 className="text-4xl md:text-6xl font-black text-white tracking-tight drop-shadow-[0_0_15px_rgba(59,130,246,0.6)]">
                WELCOME TO CEREBRO
              </h1>
              <p className="text-slate-400 max-w-xl mx-auto text-lg relative z-10">
                Access the complete timeline of Mutant history.
              </p>
              <form onSubmit={handleSearch} className="max-w-2xl mx-auto relative group z-20">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ask Cerebro (e.g., '1991', 'Uncollected issues', 'Fall of X')"
                  className="w-full bg-slate-900/50 border border-slate-700 text-white p-4 pl-12 rounded-2xl shadow-2xl focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500 transition-all text-lg placeholder:text-slate-600"
                />
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-yellow-500 transition-colors" size={24} />
                {isProcessingAI && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2">
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
              </form>
            </div>

            {searchResults.length > 0 && (
              <TimelineSection 
                title={`Search Results (${searchResults.length})`} 
                issues={searchResults} 
              />
            )}
            
            {searchResults.length === 0 && searchQuery && !isProcessingAI && (
               <div className="text-center text-slate-500 py-10">
                 No mutant signals detected matching that query.
               </div>
            )}

            {issues.length > 0 && !searchQuery && (
              <div className="bg-gradient-to-br from-slate-900 to-slate-900/50 border border-slate-800 rounded-3xl p-6 md:p-10 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <Calendar size={200} />
                </div>
                <div className="relative z-10">
                  <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
                    <div>
                      <div className="flex items-center space-x-2 text-yellow-500 font-bold tracking-widest uppercase text-sm mb-2">
                        <Sparkles size={16} />
                        <span>Daily Featured History</span>
                      </div>
                      <h2 className="text-3xl md:text-5xl font-black text-white">
                        {MONTHS[new Date().getMonth()]} {featuredYear}
                      </h2>
                      <p className="text-slate-400 mt-2">
                        Issues published in this month, canonically occurring in this era.
                      </p>
                    </div>
                  </div>

                  {featuredIssues.length > 0 ? (
                    <div className="flex overflow-x-auto pb-8 space-x-6 scrollbar-none">
                      {featuredIssues.map((issue, idx) => (
                        <IssueCard key={idx} issue={issue} />
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 border border-dashed border-slate-700 rounded-xl text-center text-slate-500">
                      Cerebro is calibrating temporal scanners... (No issues found for this specific date key)
                    </div>
                  )}
                </div>
              </div>
            )}

            {issues.length === 0 && !loading && (
              <div className="text-center py-20 space-y-6">
                <Database size={64} className="mx-auto text-slate-700" />
                <h3 className="text-2xl font-bold text-white">Database Empty</h3>
                <p className="text-slate-400">Please upload your X-Men Collections CSV to initialize Cerebro.</p>
                <button 
                  onClick={() => setActiveTab('database')}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-full font-bold transition-all"
                >
                  Go to Database Management
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'database' && (
          <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-8">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8">
              <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
                <Database className="mr-3 text-yellow-500" />
                Data Management
              </h2>
              <div className="bg-blue-900/10 border border-blue-500/20 rounded-lg p-4 mb-6">
                <div className="flex items-start space-x-3">
                  <HelpCircle className="text-blue-400 flex-shrink-0 mt-0.5" size={20} />
                  <div>
                    <h3 className="text-blue-200 font-bold mb-1">How to use</h3>
                    <p className="text-blue-300/80 text-sm leading-relaxed">
                      1. Export your Excel sheet to <strong>CSV (Comma Delimited)</strong>.<br/>
                      2. Click the box below to upload.<br/>
                      3. Cerebro will auto-detect issues even if there are empty columns in your file.
                    </p>
                  </div>
                </div>
              </div>
              <div className="space-y-6">
                <div className="bg-slate-950 p-6 rounded-xl border border-dashed border-slate-700 hover:border-blue-500 transition-colors group">
                  <label className="flex flex-col items-center cursor-pointer">
                    <Upload className="w-12 h-12 text-slate-600 group-hover:text-blue-500 mb-4 transition-colors" />
                    <span className="text-lg font-medium text-slate-300">Upload CSV Database</span>
                    <span className="text-sm text-slate-500 mt-2 text-center max-w-xs">
                        Accepts standard CSV. Auto-formats timelines based on your Month/Year layout.
                    </span>
                    <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" />
                  </label>
                </div>
                {uploadStatus && (
                  <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg text-blue-200 text-sm font-mono flex items-center">
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse mr-3"></div>
                    {uploadStatus}
                  </div>
                )}
                <div className="pt-8 border-t border-slate-800">
                   <div className="flex items-center justify-between">
                       <div>
                           <div className="text-white font-bold">Total Issues Indexed</div>
                           <div className="text-slate-400 text-sm">Stored in secure Firestore</div>
                       </div>
                       <div className="text-3xl font-mono text-yellow-500">{issues.length}</div>
                   </div>
                </div>
                 <div className="pt-4">
                    <button 
                        onClick={handleClearDatabase}
                        disabled={issues.length === 0}
                        className="w-full flex items-center justify-center space-x-2 p-4 text-red-400 border border-slate-800 hover:bg-red-900/20 hover:border-red-800 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Trash2 size={18} />
                        <span>Reset/Clear Database</span>
                    </button>
                 </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
