import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { 
    getFirestore, 
    collection, 
    query, 
    where, 
    onSnapshot, 
    addDoc, 
    updateDoc,
    deleteDoc,
    doc,
    Timestamp,
} from 'firebase/firestore';
import { Calendar, AlertCircle, Loader, Plus, X, User, MapPin, Link, Zap, Heart, Search, CheckCircle, Trash2 } from 'lucide-react';

// --- GLOBAL VARIABLES (Provided by the Canvas Environment) ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Helper function to format the date
const formatDate = (timestamp) => {
    if (!timestamp) return 'Date TBD';
    const date = timestamp instanceof Timestamp ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', {
        weekday: 'short', 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric'
    });
};

const EventCard = ({ event }) => {
    const isRemote = event.type === 'Remote';
    const tagColor = isRemote ? 'bg-indigo-600' : 'bg-pink-600';
    const accentColor = isRemote ? 'border-indigo-400' : 'border-pink-400';
    const bgColor = isRemote ? 'bg-white' : 'bg-white';

    return (
        <div className={`
            ${bgColor} rounded-3xl shadow-xl border-t-8 ${accentColor} 
            hover:shadow-2xl transition duration-300 transform hover:scale-[1.01] 
            overflow-hidden group
        `}>
            {event.imageUrl ? (
                <img 
                    src={event.imageUrl} 
                    alt={`Image for ${event.title}`} 
                    className="w-full h-40 object-cover group-hover:opacity-90 transition duration-300"
                    onError={(e) => { 
                        e.target.onerror = null; 
                        e.target.src = `https://placehold.co/600x200/5B21B6/ffffff?text=Community+Event`; 
                    }}
                />
            ) : (
                <div className="w-full h-40 bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-white font-extrabold text-2xl p-4 text-center">
                    <Zap className="w-6 h-6 mr-2"/> Upcoming Event
                </div>
            )}
            
            <div className="p-5">
                <div className="flex justify-between items-start mb-2">
                    <h3 className="text-xl font-extrabold text-gray-900 leading-snug">{event.title}</h3>
                    <span className={`text-xs font-bold px-3 py-1 rounded-full shadow-inner text-white ${tagColor}`}>
                        {event.type}
                    </span>
                </div>
                
                <p className="text-sm text-gray-600 mb-4 line-clamp-3">{event.description}</p>
                
                <div className="text-xs font-semibold space-x-2 mb-4 flex flex-wrap gap-2">
                    {event.communityFocus && event.communityFocus.map(focus => (
                        <span key={focus} className="px-2.5 py-0.5 rounded-full bg-yellow-200 text-gray-800 shadow-sm border border-yellow-300">
                            {focus}
                        </span>
                    ))}
                </div>

                <div className="text-sm space-y-2 pt-3 border-t border-gray-100">
                    <p className="flex items-center text-gray-800 font-medium">
                        <Calendar className="w-4 h-4 mr-2 text-pink-600" />
                        {formatDate(event.date)} at {event.time || 'Time TBD'}
                    </p>
                    <p className="flex items-center text-gray-800 font-medium">
                        <MapPin className="w-4 h-4 mr-2 text-purple-600" />
                        {event.location}
                    </p>
                    {event.eventLink && (
                        <a 
                            href={event.eventLink} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center text-teal-600 font-bold hover:underline transition duration-150"
                        >
                            <Link className="w-4 h-4 mr-2" />
                            Full Details/RSVP
                        </a>
                    )}
                </div>
            </div>
        </div>
    );
};

const AddEventForm = ({ db, userId, onSubmissionSuccess }) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [dateString, setDateString] = useState('');
    const [time, setTime] = useState('');
    const [location, setLocation] = useState('');
    const [eventLink, setEventLink] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [imagePreview, setImagePreview] = useState('');
    const [type, setType] = useState('In-Person');
    const [communityFocus, setCommunityFocus] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const handleCommunityChange = (focus) => {
        setCommunityFocus(prev => 
            prev.includes(focus) 
                ? prev.filter(c => c !== focus) 
                : [...prev, focus]
        );
    };
    
    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        
        setError('');
        setImageUrl('');
        setImagePreview('');
        
        if (file) {
            const MAX_SIZE = 250 * 1024; // 250KB limit
            if (file.size > MAX_SIZE) {
                setError('Image is too large. Please use an image smaller than 250KB (approx. 0.25MB) to ensure successful saving.');
                e.target.value = '';
                return;
            }
            
            const reader = new FileReader();
            reader.onloadend = () => {
                setImageUrl(reader.result);
                setImagePreview(reader.result);
            };
            reader.onerror = () => {
                setError('Failed to read image file.');
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);

        if (!title || !description || !dateString || !location || communityFocus.length === 0) {
            setError('Please fill in all required fields: Title, Description, Date, Location, and select at least one Community Focus.');
            setIsSubmitting(false);
            return;
        }

        try {
            const date = new Date(dateString);
            const eventDate = Timestamp.fromDate(date);

            const newEvent = {
                title,
                description,
                date: eventDate,
                time,
                location,
                eventLink,
                imageUrl, 
                type,
                communityFocus,
                status: 'pending', 
                submittedBy: userId,
                submittedAt: Timestamp.now(),
            };

            const eventsCollectionRef = collection(db, `artifacts/${appId}/public/data/events`);
            await addDoc(eventsCollectionRef, newEvent);

            // Reset form and UI states
            setTitle(''); setDescription(''); setDateString(''); setTime('');
            setLocation(''); setEventLink(''); setImageUrl(''); setImagePreview(''); 
            setType('In-Person');
            setCommunityFocus([]);
            const fileInput = document.querySelector('input[type="file"]');
            if(fileInput) fileInput.value = '';
            
            onSubmissionSuccess(true);

        } catch (err) {
            console.error("Error submitting event:", err);
            setError('Failed to submit event. Please try again. Check your image size if one was uploaded.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const inputClasses = "p-3 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500 shadow-sm transition duration-150";

    return (
        <form onSubmit={handleSubmit} className="p-6 bg-white rounded-3xl shadow-2xl border-t-4 border-teal-500">
            <h3 className="text-2xl font-bold mb-5 text-purple-700 flex items-center">
                <Plus className="w-5 h-5 mr-2 stroke-2"/>
                Share Your Event Details
            </h3>
            
            {error && (
                <div className="flex items-center p-3 mb-4 text-sm text-red-800 rounded-xl bg-red-100 font-semibold shadow-inner" role="alert">
                    <AlertCircle className="w-4 h-4 mr-2" />
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input type="text" placeholder="Event Title (Required)" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClasses} required />
                <input type="text" placeholder="Location (Required)" value={location} onChange={(e) => setLocation(e.target.value)} className={inputClasses} required />
                <input type="date" value={dateString} onChange={(e) => setDateString(e.target.value)} className={inputClasses} required />
                <input type="text" placeholder="Time (e.g., 7:00 PM)" value={time} onChange={(e) => setTime(e.target.value)} className={inputClasses} />
                <input type="url" placeholder="Optional: Full Event Link" value={eventLink} onChange={(e) => setEventLink(e.target.value)} className={inputClasses} />
                
                <div className="col-span-1">
                    <label className="block text-sm font-bold text-gray-700 mb-1">Event Image (Max 250KB)</label>
                    <input 
                        type="file" 
                        accept="image/png, image/jpeg"
                        onChange={handleImageUpload} 
                        className="w-full text-sm text-gray-500
                                file:py-2 file:px-4 file:mr-2
                                file:rounded-lg file:border-0
                                file:text-sm file:font-semibold
                                file:bg-pink-100 file:text-pink-700
                                hover:file:bg-pink-200"
                    />
                    {imagePreview && (
                        <div className="mt-3 relative">
                            <img src={imagePreview} alt="Image Preview" className="w-full h-24 object-cover rounded-lg shadow-inner border border-gray-200" />
                            <button 
                                type="button" 
                                onClick={() => { 
                                    setImageUrl(''); 
                                    setImagePreview(''); 
                                    const fileInput = document.querySelector('input[type="file"]');
                                    if(fileInput) fileInput.value = '';
                                    setError(''); 
                                }}
                                className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition"
                                title="Remove Image"
                            >
                                <X className="w-3 h-3"/>
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <textarea placeholder="Detailed Description (Required)..." value={description} onChange={(e) => setDescription(e.target.value)} rows="3" className={`w-full mt-4 ${inputClasses}`} required />
            
            <div className="mt-4">
                <label className="block text-sm font-bold text-gray-700 mb-1">Event Type (Required)</label>
                <select value={type} onChange={(e) => setType(e.target.value)} className={`w-full ${inputClasses}`}>
                    <option value="In-Person">In-Person</option>
                    <option value="Remote">Remote/Online</option>
                </select>
            </div>

            <div className="mt-4">
                <label className="block text-sm font-bold text-gray-700 mb-2">Community Focus (Select all that apply)</label>
                <div className="flex flex-wrap gap-2">
                    {['Trans', 'Nonbinary', 'LGBT+', 'AAPI', 'Black', 'Latinx'].map(focus => (
                        <button
                            key={focus}
                            type="button"
                            onClick={() => handleCommunityChange(focus)}
                            className={`px-3 py-1.5 rounded-full text-sm font-semibold transition duration-150 shadow-md transform active:scale-95 ${
                                communityFocus.includes(focus)
                                    ? 'bg-purple-600 text-white ring-2 ring-purple-300'
                                    : 'bg-gray-100 text-gray-700 hover:bg-purple-100 hover:text-purple-700'
                            }`}
                        >
                            {focus}
                        </button>
                    ))}
                </div>
            </div>

            <button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full mt-6 bg-gradient-to-r from-pink-500 to-purple-600 text-white p-3 rounded-xl font-extrabold text-lg shadow-lg hover:from-pink-600 hover:to-purple-700 transition duration-300 disabled:from-gray-400 disabled:to-gray-500 flex justify-center items-center transform active:scale-[0.99]"
            >
                {isSubmitting ? (
                    <>
                        <Loader className="w-5 h-5 mr-2 animate-spin" />
                        Submitting...
                    </>
                ) : (
                    'Submit Event for Review'
                )}
            </button>
        </form>
    );
};

// Component for Filter Buttons
const FilterButton = ({ label, isSelected, onClick }) => (
    <button
        onClick={onClick}
        className={`px-3 py-1.5 text-sm rounded-full font-bold transition duration-200 shadow-md transform active:scale-95 ${
            isSelected 
                ? 'bg-teal-500 text-white border-teal-600 shadow-lg shadow-teal-300/50' 
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-teal-50'
        }`}
    >
        {label}
    </button>
);

const AdminPanel = ({ db, appId, setPendingCount, onToggle }) => {
    const [pendingEvents, setPendingEvents] = useState([]);
    const [loading, setLoading] = useState(true);

    // Fetch Pending Events
    useEffect(() => {
        if (!db) return;
        
        const eventsCollectionRef = collection(db, `artifacts/${appId}/public/data/events`);
        const q = query(
            eventsCollectionRef, 
            where('status', '==', 'pending')
        );

        setLoading(true);
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedEvents = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setPendingEvents(fetchedEvents);
            setPendingCount(fetchedEvents.length); // Update the count in the parent
            setLoading(false);
        }, (error) => {
            console.error("Error listening to pending events:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [db, appId, setPendingCount]);

    const handleAction = async (eventId, newStatus) => {
        if (!db) return;
        try {
            const eventDocRef = doc(db, `artifacts/${appId}/public/data/events`, eventId);
            
            if (newStatus === 'approved') {
                await updateDoc(eventDocRef, { status: 'approved' });
            } else if (newStatus === 'delete') {
                await deleteDoc(eventDocRef);
            }
        } catch (error) {
            console.error(`Error performing ${newStatus} on event ${eventId}:`, error);
        }
    };

    return (
        <div className="p-6 bg-red-50 border-4 border-red-500 rounded-3xl shadow-inner mb-8 transition duration-300">
            <div className="flex justify-between items-center mb-4 border-b pb-2">
                <h2 className="text-2xl font-extrabold text-red-800 flex items-center">
                    <AlertCircle className="w-6 h-6 mr-2 fill-red-200 text-red-500"/> 
                    ADMIN REVIEW PANEL ({pendingEvents.length} Pending)
                </h2>
                <button 
                    onClick={onToggle}
                    className="text-gray-500 hover:text-red-700 transition"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {loading && <p className="text-center text-red-600">Loading pending submissions...</p>}

            {!loading && pendingEvents.length === 0 && (
                <p className="text-center text-lg font-semibold text-green-700 flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 mr-2" /> All clear! No events pending review.
                </p>
            )}

            <div className="space-y-4">
                {pendingEvents.map(event => (
                    <div key={event.id} className="p-4 bg-white rounded-xl shadow-md border-l-4 border-yellow-500">
                        <p className="font-bold text-lg text-gray-900">{event.title}</p>
                        <p className="text-sm text-gray-600 line-clamp-2">{event.description}</p>
                        <p className="text-xs text-gray-500 mt-1">
                            Submitted by: {event.submittedBy.substring(0, 8)}... on {formatDate(event.submittedAt)}
                        </p>
                        <div className="mt-3 flex space-x-2">
                            <button
                                onClick={() => handleAction(event.id, 'approved')}
                                className="flex items-center text-sm font-semibold bg-green-500 text-white px-3 py-1 rounded-full hover:bg-green-600 transition shadow-lg"
                            >
                                <CheckCircle className="w-4 h-4 mr-1"/> Approve
                            </button>
                            <button
                                onClick={() => handleAction(event.id, 'delete')}
                                className="flex items-center text-sm font-semibold bg-red-500 text-white px-3 py-1 rounded-full hover:bg-red-600 transition shadow-lg"
                            >
                                <Trash2 className="w-4 h-4 mr-1"/> Delete
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};


const App = () => {
    const [db, setDb] = useState(null);
    const [userId, setUserId] = useState(null);
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [submissionSuccess, setSubmissionSuccess] = useState(false);
    const [pendingCount, setPendingCount] = useState(0);
    const [showAdminPanel, setShowAdminPanel] = useState(false); // New state for admin panel toggle

    // --- Filter State ---
    const [selectedCommunities, setSelectedCommunities] = useState(['Trans', 'Nonbinary', 'LGBT+']);
    const [selectedType, setSelectedType] = useState('All'); 


    // 1. Initialize Firebase and Authentication
    useEffect(() => {
        if (Object.keys(firebaseConfig).length === 0) {
            console.error("Firebase config is missing.");
            return;
        }

        try {
            const app = initializeApp(firebaseConfig);
            const firestore = getFirestore(app);
            const userAuth = getAuth(app);
            
            setDb(firestore);
            
            const handleSignIn = async (authInstance) => {
                try {
                    if (initialAuthToken) {
                        await signInWithCustomToken(authInstance, initialAuthToken);
                    } else {
                        await signInAnonymously(authInstance);
                    }
                } catch (e) {
                    console.error("Firebase sign-in failed:", e);
                    await signInAnonymously(authInstance);
                }
            };

            const unsubscribe = onAuthStateChanged(userAuth, (user) => {
                if (user) {
                    setUserId(user.uid);
                } else {
                    setUserId(crypto.randomUUID()); 
                }
            });

            handleSignIn(userAuth);
            return () => unsubscribe();

        } catch (e) {
            console.error("Error initializing Firebase:", e);
        }
    }, []);

    // 2. Fetch Approved Events (Real-time Listener)
    useEffect(() => {
        if (!db || !userId) {
            console.log("Waiting for DB or UserID to be ready for approved events query...");
            return;
        }

        const eventsCollectionRef = collection(db, `artifacts/${appId}/public/data/events`);
        const q = query(
            eventsCollectionRef, 
            where('status', '==', 'approved')
        );

        setLoading(true);
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedEvents = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setEvents(fetchedEvents);
            setLoading(false);
        }, (error) => {
            console.error("Error listening to approved events:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [db, userId]); 

    // 3. Fetch Pending Event Count (This is now handled by AdminPanel, but we keep the logic for the header indicator)
    useEffect(() => {
        if (!db || !userId) return;
        
        const eventsCollectionRef = collection(db, `artifacts/${appId}/public/data/events`);
        const q = query(
            eventsCollectionRef, 
            where('status', '==', 'pending')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            setPendingCount(snapshot.size);
        }, (error) => {
            console.error("Error counting pending events:", error);
        });

        return () => unsubscribe();
    }, [db, userId]); 


    // --- Filtering Logic ---
    const filteredEvents = useMemo(() => {
        let currentEvents = [...events];
        
        // 1. Sort by Date (in memory, avoids index requirement)
        currentEvents.sort((a, b) => {
            const dateA = a.date instanceof Timestamp ? a.date.toMillis() : new Date(a.date).getTime();
            const dateB = b.date instanceof Timestamp ? b.date.toMillis() : new Date(b.date).getTime();
            return dateA - dateB;
        });

        // 2. Filter by Event Type
        if (selectedType !== 'All') {
            currentEvents = currentEvents.filter(event => event.type === selectedType);
        }

        // 3. Filter by Community Focus
        if (selectedCommunities.length > 0) {
            currentEvents = currentEvents.filter(event => 
                event.communityFocus && selectedCommunities.some(focus => event.communityFocus.includes(focus))
            );
        }
        
        return currentEvents;
    }, [events, selectedType, selectedCommunities]);
    // --- End Filtering Logic ---


    const handleCommunityFilter = (focus) => {
        setSelectedCommunities(prev => 
            prev.includes(focus) 
                ? prev.filter(c => c !== focus) 
                : [...prev, focus]
        );
    };

    const handleSubmissionSuccess = (isSuccessful) => {
        setSubmissionSuccess(isSuccessful);
        setShowForm(false);
        setTimeout(() => setSubmissionSuccess(false), 5000); 
    }

    return (
        <div className="min-h-screen font-sans p-4 sm:p-8 bg-gray-50">
            <script src="https://cdn.tailwindcss.com"></script>
            {/* Custom background pattern for texture */}
            <div className="fixed inset-0 -z-10 bg-gradient-to-br from-pink-50 to-purple-50 opacity-50"></div>
            <div className="fixed inset-0 -z-10 opacity-10" style={{ 
                backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'6\' height=\'6\' viewBox=\'0 0 6 6\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'%23a1a1aa\' fill-opacity=\'0.4\' fill-rule=\'evenodd\'%3E%3Cpath d=\'M5 0h1L0 6V5zm1 5v1H5z\'/%3E%3C/g%3E%3C/svg%3E")',
            }}></div>
            
            <div className="max-w-4xl mx-auto z-10 relative">
                
                {/* Header/Mission Section */}
                <header className="mb-8 p-8 bg-gradient-to-r from-purple-700 to-indigo-700 text-white rounded-3xl shadow-2xl border-b-8 border-pink-400">
                    <div className="flex items-center mb-2">
                        <Heart className="w-8 h-8 mr-3 fill-pink-300 text-pink-300"/>
                        <p className="text-xl font-semibold opacity-90">HOUSTON COMMUNITY HUB</p>
                    </div>
                    <h1 className="text-5xl sm:text-6xl font-extrabold leading-tight mb-3">
                        Find Your Next Vibe
                    </h1>
                    <p className="text-lg font-medium opacity-90 border-l-4 border-teal-300 pl-4">
                        Discover vibrant, inclusive events and support for the Trans, Nonbinary, and Queer communities across the Houston area.
                    </p>
                    <div className="mt-4 text-sm font-mono flex justify-between items-center bg-black/10 p-2 rounded-lg">
                        <span className="flex items-center">
                            <User className="w-4 h-4 mr-2 text-teal-300"/>
                            User ID: {userId ? userId.substring(0, 12) + '...' : 'Authenticating...'}
                        </span>
                        {/* Hidden button to show Admin Panel for quick testing/moderation */}
                        <button 
                            onClick={() => setShowAdminPanel(!showAdminPanel)}
                            className="text-yellow-300 font-bold bg-black/20 p-1 rounded-lg text-xs animate-pulse hover:bg-black/40 transition"
                            title="Toggle Admin Review Panel"
                        >
                            {pendingCount} events pending review! (Click to Review)
                        </button>
                    </div>
                </header>

                {/* Admin Panel */}
                {showAdminPanel && db && (
                    <AdminPanel 
                        db={db} 
                        appId={appId} 
                        setPendingCount={setPendingCount} 
                        onToggle={() => setShowAdminPanel(false)}
                    />
                )}
                

                {/* Event Submission Section */}
                <section className="mb-8">
                    {submissionSuccess && (
                        <div className="flex items-center p-4 mb-4 text-base font-semibold text-green-800 rounded-xl bg-green-200 shadow-md" role="alert">
                            <Plus className="w-5 h-5 mr-2" />
                            Success! Your event is pending review. You can approve it using the Admin Panel above!
                        </div>
                    )}
                    <button 
                        onClick={() => setShowForm(!showForm)}
                        className="w-full p-4 mb-4 bg-gradient-to-r from-pink-500 to-red-500 text-white rounded-xl font-extrabold text-lg shadow-lg hover:from-pink-600 hover:to-red-600 transition duration-300 transform hover:scale-[1.01] flex items-center justify-center"
                    >
                        {showForm ? (
                            <>
                                <X className="w-5 h-5 mr-2"/> Hide Submission Form
                            </>
                        ) : (
                            <>
                                <Plus className="w-5 h-5 mr-2"/> Share Your Community Event!
                            </>
                        )}
                    </button>
                    {showForm && db && userId && (
                        <AddEventForm 
                            db={db} 
                            userId={userId} 
                            onSubmissionSuccess={handleSubmissionSuccess} 
                        />
                    )}
                </section>
                
                {/* Filter Controls */}
                <section className="bg-white p-5 rounded-3xl shadow-xl mb-8 border-l-4 border-r-4 border-teal-500">
                    <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
                        <Search className="w-5 h-5 mr-2 text-teal-600"/> Refine Your Search
                    </h2>
                    
                    {/* Community Focus Filters */}
                    <div className="mb-4 border-b pb-4 border-dashed border-gray-200">
                        <p className="text-sm font-bold text-gray-700 mb-2">Community Focus:</p>
                        <div className="flex flex-wrap gap-3">
                            {['Trans', 'Nonbinary', 'LGBT+', 'AAPI', 'Black', 'Latinx'].map(focus => (
                                <FilterButton 
                                    key={focus}
                                    label={focus}
                                    isSelected={selectedCommunities.includes(focus)}
                                    onClick={() => handleCommunityFilter(focus)}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Type Filters */}
                    <div>
                        <p className="text-sm font-bold text-gray-700 mb-2">Location Type:</p>
                        <div className="flex flex-wrap gap-3">
                            {['All', 'In-Person', 'Remote'].map(type => (
                                <FilterButton 
                                    key={type}
                                    label={type}
                                    isSelected={selectedType === type}
                                    onClick={() => setSelectedType(type)}
                                />
                            ))}
                        </div>
                    </div>
                </section>


                {/* Event List */}
                <section>
                    <h2 className="text-3xl font-extrabold text-gray-900 mb-6">
                        Showing {filteredEvents.length} Upcoming Events
                    </h2>

                    {loading && (
                        <div className="flex justify-center items-center h-48 bg-white rounded-xl shadow-lg">
                            <Loader className="w-10 h-10 text-pink-600 animate-spin" />
                            <p className="ml-3 text-lg text-gray-700 font-semibold">Loading the most fabulous events...</p>
                        </div>
                    )}

                    {!loading && filteredEvents.length === 0 && (
                        <div className="text-center p-12 bg-white rounded-xl shadow-lg border border-yellow-400">
                            <AlertCircle className="w-12 h-12 mx-auto text-yellow-500 mb-4" />
                            <p className="text-xl font-bold text-gray-700">
                                Nothing matched your sparkle!
                            </p>
                            <p className="text-base text-gray-600 mt-2">
                                Try adjusting your filters or check back soon for more events.
                            </p>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {filteredEvents.map(event => (
                            <EventCard key={event.id} event={event} />
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
};

export default App;
