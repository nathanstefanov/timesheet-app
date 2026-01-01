// pages/calendar.tsx
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import Head from 'next/head';
import { Calendar as CalendarIcon, Plus, Edit2, Trash2, X, MapPin, Clock, FileText, User, LogOut, Settings, BarChart3, DollarSign } from 'lucide-react';
import { useToast } from '../hooks/useToast';

declare global {
  interface Window {
    google?: any;
  }
}

type CalendarEvent = {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

type Profile = {
  id: string;
  full_name: string | null;
  role: 'admin' | 'employee';
  email: string | null;
};

// Location display component that enriches addresses with business names
function LocationDisplay({ location, enrichLocation }: { location: string; enrichLocation: (addr: string) => Promise<string> }) {
  const [displayLocation, setDisplayLocation] = useState(location);

  useEffect(() => {
    let mounted = true;
    enrichLocation(location).then(enriched => {
      if (mounted) {
        setDisplayLocation(enriched);
      }
    });
    return () => { mounted = false; };
  }, [location, enrichLocation]);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      color: '#64748b',
      fontSize: '14px',
    }}>
      <MapPin size={16} />
      <span>{displayLocation}</span>
    </div>
  );
}

// Google Maps loader (singleton pattern)
const loadGoogleMaps = (() => {
  let promise: Promise<any> | null = null;

  return async () => {
    if (typeof window === 'undefined') return Promise.resolve(null);
    if (window.google?.maps) return Promise.resolve(window.google.maps);

    if (!promise) {
      const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
      if (!key) return Promise.reject(new Error('Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY'));

      promise = (async () => {
        try {
          const { setOptions, importLibrary } = await import('@googlemaps/js-api-loader');
          setOptions({ key: key, v: 'weekly' });
          await importLibrary('places');
          return window.google?.maps;
        } catch {
          // Fallback to direct script loading
          const id = 'gmaps-js';
          if (document.getElementById(id)) return window.google?.maps;
          const s = document.createElement('script');
          s.id = id;
          s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&v=weekly`;
          s.async = true;
          await new Promise<void>((resolve, reject) => {
            s.onerror = () => reject(new Error('Failed to load Google Maps JS API'));
            s.onload = () => resolve();
            document.head.appendChild(s);
          });
          return window.google?.maps;
        }
      })();
    }
    return promise;
  };
})();

export default function Calendar() {
  const router = useRouter();
  const { success, error } = useToast();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [adminSectionExpanded, setAdminSectionExpanded] = useState(true);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');

  // View state
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Cache for enriched locations
  const [locationCache, setLocationCache] = useState<Record<string, string>>({});

  // Google Maps refs
  const addLocationInputRef = useRef<HTMLInputElement>(null);
  const editLocationInputRef = useRef<HTMLInputElement>(null);
  const addAutocompleteRef = useRef<any>(null);
  const editAutocompleteRef = useRef<any>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  useEffect(() => {
    if (profile) {
      loadEvents();
    }
  }, [profile, currentMonth]);

  // Initialize Google Maps Autocomplete when Add modal opens
  useEffect(() => {
    if (showAddModal && profile?.role === 'admin' && addLocationInputRef.current) {
      const timer = setTimeout(() => {
        initAutocomplete(addLocationInputRef.current!, addAutocompleteRef);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [showAddModal, profile]);

  // Initialize Google Maps Autocomplete when Edit modal opens
  useEffect(() => {
    if (showEditModal && profile?.role === 'admin' && editLocationInputRef.current) {
      const timer = setTimeout(() => {
        initAutocomplete(editLocationInputRef.current!, editAutocompleteRef);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [showEditModal, profile]);

  async function enrichLocation(address: string): Promise<string> {
    // Return from cache if available
    if (locationCache[address]) {
      return locationCache[address];
    }

    // If location already has a comma (likely already enriched), return as-is
    const commaParts = address.split(',');
    if (commaParts.length >= 3) {
      // Likely already has "Name, Address" format or is detailed
      setLocationCache(prev => ({ ...prev, [address]: address }));
      return address;
    }

    try {
      const maps = await loadGoogleMaps();
      if (!maps || !window.google?.maps?.places) {
        return address;
      }

      const geocoder = new window.google.maps.Geocoder();
      const result = await new Promise<any>((resolve, reject) => {
        geocoder.geocode({ address }, (results: any, status: any) => {
          if (status === 'OK' && results?.[0]) {
            resolve(results[0]);
          } else {
            reject(new Error('Geocoding failed'));
          }
        });
      });

      // Try to get place details for the first result
      if (result.place_id) {
        const service = new window.google.maps.places.PlacesService(document.createElement('div'));
        const placeDetails = await new Promise<any>((resolve, reject) => {
          service.getDetails({ placeId: result.place_id, fields: ['name', 'formatted_address'] }, (place: any, status: any) => {
            if (status === 'OK' && place) {
              resolve(place);
            } else {
              reject(new Error('Place details failed'));
            }
          });
        });

        if (placeDetails.name && placeDetails.formatted_address) {
          // Check if name is already in address
          if (placeDetails.formatted_address.includes(placeDetails.name)) {
            const enriched = placeDetails.formatted_address;
            setLocationCache(prev => ({ ...prev, [address]: enriched }));
            return enriched;
          } else {
            const enriched = `${placeDetails.name}, ${placeDetails.formatted_address}`;
            setLocationCache(prev => ({ ...prev, [address]: enriched }));
            return enriched;
          }
        }
      }

      // Fallback to original address
      setLocationCache(prev => ({ ...prev, [address]: address }));
      return address;
    } catch (err) {
      console.log('Failed to enrich location:', err);
      // Cache the original to avoid repeated lookups
      setLocationCache(prev => ({ ...prev, [address]: address }));
      return address;
    }
  }

  async function initAutocomplete(inputElement: HTMLInputElement, autocompleteRefObj: React.MutableRefObject<any>) {
    try {
      console.log('Initializing Google Maps autocomplete...');
      const maps = await loadGoogleMaps();
      console.log('Google Maps loaded:', !!maps);

      if (!window.google?.maps?.places) {
        console.error('Google Maps Places library not available');
        return;
      }

      if (!inputElement) {
        console.error('Location input element not available');
        return;
      }

      // Clear existing autocomplete if any
      if (autocompleteRefObj.current) {
        window.google.maps.event.clearInstanceListeners(autocompleteRefObj.current);
      }

      console.log('Creating Autocomplete instance...');
      const autocomplete = new window.google.maps.places.Autocomplete(inputElement, {
        types: ['geocode', 'establishment'],
        fields: ['formatted_address', 'name', 'geometry'],
      });

      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        console.log('Place selected:', place);

        // Combine name and address if both are available
        if (place.name && place.formatted_address) {
          // If the name is already part of the address, just use the address
          if (place.formatted_address.includes(place.name)) {
            setLocation(place.formatted_address);
          } else {
            // Otherwise combine: "Business Name, Address"
            setLocation(`${place.name}, ${place.formatted_address}`);
          }
        } else if (place.formatted_address) {
          setLocation(place.formatted_address);
        } else if (place.name) {
          setLocation(place.name);
        }
      });

      autocompleteRefObj.current = autocomplete;
      console.log('Autocomplete initialized successfully');
    } catch (err) {
      console.error('Failed to initialize Google Maps autocomplete:', err);
      error('Failed to load location autocomplete. You can still type the location manually.');
    }
  }

  async function loadProfile() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.replace('/');
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .eq('id', session.user.id)
        .single();

      if (profileError) throw profileError;

      setProfile({
        ...profileData,
        email: session.user.email || null,
      } as Profile);
    } catch (err: any) {
      console.error('Failed to load profile:', err);
      error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  }

  async function loadEvents() {
    try {
      const { data, error: fetchError } = await supabase
        .from('calendar_events')
        .select('*')
        .order('event_date', { ascending: true })
        .order('start_time', { ascending: true });

      if (fetchError) throw fetchError;

      setEvents(data || []);
    } catch (err: any) {
      console.error('Failed to load events:', err);
      error('Failed to load events');
    }
  }

  function openAddModal() {
    setTitle('');
    setDescription('');
    setEventDate('');
    setStartTime('');
    setEndTime('');
    setLocation('');
    setShowAddModal(true);
  }

  function openEditModal(event: CalendarEvent) {
    setEditingEvent(event);
    setTitle(event.title);
    setDescription(event.description || '');
    setEventDate(event.event_date);
    setStartTime(event.start_time || '');
    setEndTime(event.end_time || '');
    setLocation(event.location || '');
    setShowEditModal(true);
  }

  async function handleAddEvent() {
    if (!title.trim()) {
      error('Please enter an event title');
      return;
    }

    if (!eventDate) {
      error('Please select an event date');
      return;
    }

    if (startTime && endTime && startTime >= endTime) {
      error('End time must be after start time');
      return;
    }

    setSaving(true);
    try {
      const { error: insertError } = await supabase
        .from('calendar_events')
        .insert({
          title: title.trim(),
          description: description.trim() || null,
          event_date: eventDate,
          start_time: startTime || null,
          end_time: endTime || null,
          location: location.trim() || null,
          created_by: profile!.id,
        });

      if (insertError) throw insertError;

      success('Event created successfully!');
      setShowAddModal(false);
      await loadEvents();
    } catch (err: any) {
      console.error('Failed to add event:', err);
      error(err.message || 'Failed to add event');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateEvent() {
    if (!title.trim()) {
      error('Please enter an event title');
      return;
    }

    if (!eventDate || !editingEvent) {
      error('Please select an event date');
      return;
    }

    if (startTime && endTime && startTime >= endTime) {
      error('End time must be after start time');
      return;
    }

    setSaving(true);
    try {
      const { error: updateError } = await supabase
        .from('calendar_events')
        .update({
          title: title.trim(),
          description: description.trim() || null,
          event_date: eventDate,
          start_time: startTime || null,
          end_time: endTime || null,
          location: location.trim() || null,
        })
        .eq('id', editingEvent.id);

      if (updateError) throw updateError;

      success('Event updated successfully!');
      setShowEditModal(false);
      await loadEvents();
    } catch (err: any) {
      console.error('Failed to update event:', err);
      error(err.message || 'Failed to update event');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteEvent(eventId: string) {
    if (!confirm('Are you sure you want to delete this event?')) {
      return;
    }

    try {
      const { error: deleteError } = await supabase
        .from('calendar_events')
        .delete()
        .eq('id', eventId);

      if (deleteError) throw deleteError;

      success('Event deleted successfully!');
      await loadEvents();
    } catch (err: any) {
      console.error('Failed to delete event:', err);
      error(err.message || 'Failed to delete event');
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  // Group events by date
  const eventsByDate = events.reduce((acc, event) => {
    const date = event.event_date;
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(event);
    return acc;
  }, {} as Record<string, CalendarEvent[]>);

  // Get unique dates sorted
  const uniqueDates = Object.keys(eventsByDate).sort();

  if (loading || !profile) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>;
  }

  const isAdmin = profile.role === 'admin';

  return (
    <>
      <Head>
        <title>Calendar - Timesheet</title>
        <style>{`
          .pac-container {
            z-index: 10000 !important;
          }
        `}</style>
      </Head>

      <div className="app-container">
        {/* MOBILE MENU BUTTON */}
        <button
          className="mobile-menu-toggle"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
        >
          ☰
        </button>

        {/* MOBILE OVERLAY */}
        <div
          className={`mobile-menu-overlay ${mobileMenuOpen ? 'active' : ''}`}
          onClick={() => setMobileMenuOpen(false)}
        />

        {/* SIDEBAR */}
        <aside className={`app-sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
          <div className="sidebar-header">
            <div className="sidebar-logo">
              <div className="sidebar-logo-icon">T</div>
              <div className="sidebar-logo-text">Timesheet</div>
            </div>
          </div>

          <nav className="sidebar-nav">
            <div className="sidebar-nav-section">
              <div className="sidebar-nav-label">Main</div>
              <a href="/dashboard" className="sidebar-nav-item" onClick={() => setMobileMenuOpen(false)}>
                <span className="sidebar-nav-icon"><User size={18} /></span>
                <span>My Shifts</span>
              </a>
              <a href="/new-shift" className="sidebar-nav-item" onClick={() => setMobileMenuOpen(false)}>
                <span className="sidebar-nav-icon"><Plus size={18} /></span>
                <span>Log Shift</span>
              </a>
              <a href="/me/schedule" className="sidebar-nav-item" onClick={() => setMobileMenuOpen(false)}>
                <span className="sidebar-nav-icon"><CalendarIcon size={18} /></span>
                <span>My Schedule</span>
              </a>
              <a href="/calendar" className="sidebar-nav-item active" onClick={() => setMobileMenuOpen(false)}>
                <span className="sidebar-nav-icon"><CalendarIcon size={18} /></span>
                <span>Calendar</span>
              </a>
              <a href="/reports" className="sidebar-nav-item" onClick={() => setMobileMenuOpen(false)}>
                <span className="sidebar-nav-icon"><BarChart3 size={18} /></span>
                <span>Reports</span>
              </a>
              <a href="/settings" className="sidebar-nav-item" onClick={() => setMobileMenuOpen(false)}>
                <span className="sidebar-nav-icon"><Settings size={18} /></span>
                <span>Settings</span>
              </a>
            </div>

            {isAdmin && (
              <div className="sidebar-nav-section">
                <div
                  className="sidebar-nav-label"
                  onClick={() => setAdminSectionExpanded(!adminSectionExpanded)}
                  style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                  <span>Admin</span>
                  <span style={{ fontSize: '12px', transition: 'transform 0.2s', transform: adminSectionExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
                </div>
                {adminSectionExpanded && (
                  <>
                    <a href="/admin" className="sidebar-nav-item" onClick={() => setMobileMenuOpen(false)}>
                      <span className="sidebar-nav-icon"><BarChart3 size={18} /></span>
                      <span>Admin Dashboard</span>
                    </a>
                    <a href="/admin-schedule" className="sidebar-nav-item" onClick={() => setMobileMenuOpen(false)}>
                      <span className="sidebar-nav-icon"><CalendarIcon size={18} /></span>
                      <span>Schedule</span>
                    </a>
                    <a href="/admin-schedule-past" className="sidebar-nav-item" onClick={() => setMobileMenuOpen(false)}>
                      <span className="sidebar-nav-icon"><CalendarIcon size={18} /></span>
                      <span>Past Schedule</span>
                    </a>
                    <a href="/payroll" className="sidebar-nav-item" onClick={() => setMobileMenuOpen(false)}>
                      <span className="sidebar-nav-icon"><DollarSign size={18} /></span>
                      <span>Payroll</span>
                    </a>
                    <a href="/payment-history" className="sidebar-nav-item" onClick={() => setMobileMenuOpen(false)}>
                      <span className="sidebar-nav-icon"><DollarSign size={18} /></span>
                      <span>Payment History</span>
                    </a>
                    <a href="/employees" className="sidebar-nav-item" onClick={() => setMobileMenuOpen(false)}>
                      <span className="sidebar-nav-icon"><User size={18} /></span>
                      <span>Employees</span>
                    </a>
                  </>
                )}
              </div>
            )}
          </nav>

          <div className="sidebar-footer">
            <div className="sidebar-user">
              <div className="sidebar-user-avatar">
                {profile.full_name?.charAt(0) || 'U'}
              </div>
              <div className="sidebar-user-info">
                <div className="sidebar-user-name">{profile.full_name || 'User'}</div>
                <div className="sidebar-user-role">{profile.role === 'admin' ? 'Administrator' : 'Employee'}</div>
              </div>
            </div>
            <button className="sidebar-logout" onClick={handleLogout}>
              <LogOut size={18} />
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="app-main">
          <header className="app-header">
            <div>
              <h1 className="header-title">Calendar</h1>
              <p className="header-subtitle">Company events and important dates</p>
            </div>
            {isAdmin && (
              <button
                onClick={openAddModal}
                style={{
                  padding: '10px 20px',
                  background: '#6366f1',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '14px',
                  fontWeight: 600,
                }}
              >
                <Plus size={18} />
                Add Event
              </button>
            )}
          </header>

          <div className="app-content">
            {uniqueDates.length === 0 ? (
              <div style={{
                padding: '60px 20px',
                textAlign: 'center',
                background: 'white',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
              }}>
                <CalendarIcon size={48} style={{ color: '#94a3b8', margin: '0 auto 16px' }} />
                <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
                  No events scheduled
                </h3>
                <p style={{ color: '#64748b', fontSize: '14px' }}>
                  {isAdmin ? 'Click "Add Event" to create your first calendar event' : 'Check back later for upcoming events'}
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {uniqueDates.map((date) => {
                  const dateEvents = eventsByDate[date];
                  const dateObj = new Date(date + 'T00:00:00');
                  const formattedDate = dateObj.toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  });

                  return (
                    <div key={date}>
                      <h2 style={{
                        fontSize: '16px',
                        fontWeight: 600,
                        color: '#475569',
                        marginBottom: '12px',
                        paddingBottom: '8px',
                        borderBottom: '2px solid #e2e8f0',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}>
                        {formattedDate}
                        <span style={{
                          fontSize: '16px',
                          fontWeight: 700,
                          color: '#000000ff',
                        }}>
                          ({dateEvents.length})
                        </span>
                      </h2>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {dateEvents.map((event) => (
                          <div
                            key={event.id}
                            style={{
                              background: 'white',
                              border: '1px solid #e2e8f0',
                              borderRadius: '12px',
                              padding: '20px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'flex-start',
                              gap: '16px',
                            }}
                          >
                            <div style={{ flex: 1 }}>
                              <h3 style={{
                                fontSize: '18px',
                                fontWeight: 600,
                                color: '#1e293b',
                                marginBottom: '8px',
                              }}>
                                {event.title}
                              </h3>

                              {event.description && (
                                <div style={{
                                  display: 'flex',
                                  alignItems: 'flex-start',
                                  gap: '8px',
                                  marginBottom: '8px',
                                  color: '#475569',
                                  fontSize: '14px',
                                }}>
                                  <FileText size={16} style={{ marginTop: '2px', flexShrink: 0 }} />
                                  <span>{event.description}</span>
                                </div>
                              )}

                              {(event.start_time || event.end_time) && (
                                <div style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  marginBottom: '8px',
                                  color: '#64748b',
                                  fontSize: '14px',
                                }}>
                                  <Clock size={16} />
                                  <span>
                                    {event.start_time && new Date(`2000-01-01T${event.start_time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                    {event.start_time && event.end_time && ' - '}
                                    {event.end_time && new Date(`2000-01-01T${event.end_time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                  </span>
                                </div>
                              )}

                              {event.location && (
                                <LocationDisplay location={event.location} enrichLocation={enrichLocation} />
                              )}
                            </div>

                            {isAdmin && (
                              <div style={{ display: 'flex', gap: '8px' }}>
                                <button
                                  onClick={() => openEditModal(event)}
                                  style={{
                                    padding: '8px',
                                    background: '#f1f5f9',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    color: '#475569',
                                  }}
                                >
                                  <Edit2 size={16} />
                                </button>
                                <button
                                  onClick={() => handleDeleteEvent(event.id)}
                                  style={{
                                    padding: '8px',
                                    background: '#fee2e2',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    color: '#991b1b',
                                  }}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Add Event Modal */}
      {showAddModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px',
        }} onClick={() => setShowAddModal(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white',
              borderRadius: '12px',
              maxWidth: '500px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
            }}
          >
            <div style={{
              padding: '24px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#1e293b', margin: 0 }}>
                Add Calendar Event
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  color: '#64748b',
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '14px', fontWeight: 500, color: '#475569', display: 'block', marginBottom: '6px' }}>
                  Title <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Team Meeting"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '14px', fontWeight: 500, color: '#475569', display: 'block', marginBottom: '6px' }}>
                  Date <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '14px', fontWeight: 500, color: '#475569', display: 'block', marginBottom: '6px' }}>
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '14px',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '14px', fontWeight: 500, color: '#475569', display: 'block', marginBottom: '6px' }}>
                    End Time
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '14px',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '14px', fontWeight: 500, color: '#475569', display: 'block', marginBottom: '6px' }}>
                  Location
                </label>
                <input
                  ref={addLocationInputRef}
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Search for a location..."
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '14px', fontWeight: 500, color: '#475569', display: 'block', marginBottom: '6px' }}>
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Event details..."
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button
                  onClick={() => setShowAddModal(false)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: '#f1f5f9',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#475569',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddEvent}
                  disabled={saving}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: '#6366f1',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: 'white',
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? 'Adding...' : 'Add Event'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Event Modal */}
      {showEditModal && editingEvent && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px',
        }} onClick={() => setShowEditModal(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white',
              borderRadius: '12px',
              maxWidth: '500px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto',
            }}
          >
            <div style={{
              padding: '24px',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#1e293b', margin: 0 }}>
                Edit Calendar Event
              </h2>
              <button
                onClick={() => setShowEditModal(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  color: '#64748b',
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ fontSize: '14px', fontWeight: 500, color: '#475569', display: 'block', marginBottom: '6px' }}>
                  Title <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Team Meeting"
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '14px', fontWeight: 500, color: '#475569', display: 'block', marginBottom: '6px' }}>
                  Date <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '14px', fontWeight: 500, color: '#475569', display: 'block', marginBottom: '6px' }}>
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '14px',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '14px', fontWeight: 500, color: '#475569', display: 'block', marginBottom: '6px' }}>
                    End Time
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      fontSize: '14px',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '14px', fontWeight: 500, color: '#475569', display: 'block', marginBottom: '6px' }}>
                  Location
                </label>
                <input
                  ref={editLocationInputRef}
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Search for a location..."
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '14px', fontWeight: 500, color: '#475569', display: 'block', marginBottom: '6px' }}>
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Event details..."
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '14px',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button
                  onClick={() => setShowEditModal(false)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: '#f1f5f9',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#475569',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateEvent}
                  disabled={saving}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: '#6366f1',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: 'white',
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
