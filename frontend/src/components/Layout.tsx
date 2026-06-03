import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Package, FileText, LogOut, Menu, LayoutDashboard, Users, ClipboardList, FolderLock, Clock, Settings, User, Bell, ChevronDown, UserPlus } from 'lucide-react';
import api from '../utils/api';
import { useAuth } from '../hooks/useAuth';
import { formatDateTime } from '../utils/dateFormat';

export default function Layout({ children }: { children: React.ReactNode }) {
  const { logout: authLogout } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const profileDropdownRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // Set initial sidebar state based on screen size
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setSidebarOpen(true); // Open on desktop
      } else {
        setSidebarOpen(false); // Closed on mobile
      }
    };

    handleResize(); // Set initial state
    window.addEventListener('resize', handleResize);

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    api.get('/auth/profile').then((res) => setProfile(res.data));
  }, []);

  useEffect(() => {
    const fetchNotifications = () => {
      // Only fetch if document is visible to reduce unnecessary requests
      if (document.hidden) return;

      api.get('/dashboard/notifications').then((res) => setNotificationCount(res.data.total));
      api.get('/dashboard/notifications/list').then((res) => setNotifications(res.data.notifications || []));
    };

    fetchNotifications();
    // Reduced polling frequency from 5 seconds to 30 seconds to minimize server load
    const interval = setInterval(fetchNotifications, 30000);

    const handleNotificationUpdate = () => {
      fetchNotifications();
    };

    const handleVisibilityChange = () => {
      // Only fetch when tab becomes visible, not when it becomes hidden
      if (!document.hidden) {
        fetchNotifications();
      }
    };

    const handleFocus = () => {
      // Only fetch on focus if tab was previously hidden
      if (!document.hidden) {
        fetchNotifications();
      }
    };

    window.addEventListener('notificationUpdate', handleNotificationUpdate);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('notificationUpdate', handleNotificationUpdate);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);



  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setNotificationOpen(false);
      }
    };

    if (notificationOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [notificationOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
        setProfileDropdownOpen(false);
      }
    };

    if (profileDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [profileDropdownOpen]);

  const handleNotificationClick = (notification: any) => {
    setNotificationOpen(false);
    
    if (notification.type === 'USER') {
      navigate('/admin/users');
    } else if (notification.type === 'LEAVE') {
      navigate('/admin/leave-review');
    } else if (notification.type === 'PRODUCT') {
      navigate('/admin/product-reviews');
    }
  };



  const modules = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', roles: ['ADMIN', 'HOD', 'FACULTY', 'SUPER_ADMIN'] },
    { name: 'Leave Management', icon: Calendar, path: '/leave', roles: ['HOD', 'FACULTY'] },
    { name: 'Product Requests', icon: Package, path: '/products', roles: ['HOD', 'FACULTY'] },
    { name: 'Vaultify', icon: FolderLock, path: '/vaultify', roles: ['HOD', 'FACULTY'] },
    { name: 'My Timetables', icon: Clock, path: '/timetables', roles: ['HOD', 'FACULTY'] },
    { name: 'User Management', icon: Users, path: '/admin/users', roles: ['ADMIN', 'SUPER_ADMIN'] },
    { name: 'Pending Items', icon: ClipboardList, path: '/admin/pending', roles: ['ADMIN', 'SUPER_ADMIN'] },
    { name: 'Faculty Approvals', icon: FileText, path: '/admin/approvals', roles: ['ADMIN'] },
    { name: 'Product Reviews', icon: Package, path: '/admin/product-reviews', roles: ['ADMIN'] },
    { name: 'Leave Review', icon: Calendar, path: '/admin/leave-review', roles: ['ADMIN'] },
    { name: 'Leave Log', icon: FileText, path: '/admin/leave-log', roles: ['ADMIN', 'SUPER_ADMIN'] },
    { name: 'Product Log', icon: Package, path: '/admin/product-log', roles: ['ADMIN', 'SUPER_ADMIN'] },
    { name: 'Timetable Assignment', icon: Clock, path: '/admin/timetables', roles: ['ADMIN'] },
    { name: 'Leave Balance', icon: Settings, path: '/admin/leave-balance', roles: ['ADMIN', 'SUPER_ADMIN'] },
    { name: 'Admin Logs', icon: FileText, path: '/admin/logs', roles: ['ADMIN', 'SUPER_ADMIN'] }
  ];

  const visibleModules = modules.filter(m => m.roles.includes(profile?.role_name));

  const handleLogout = async () => {
    await authLogout();
    navigate('/login');
  };

  const sidebarVariants = {
    open: { x: 0, transition: { type: "spring", stiffness: 300, damping: 30 } },
    closed: { x: "-100%", transition: { type: "spring", stiffness: 300, damping: 30 } }
  };

  const overlayVariants = {
    open: { opacity: 1, transition: { duration: 0.2 } },
    closed: { opacity: 0, transition: { duration: 0.2 } }
  };

  return (
    <div className="min-h-screen bg-gray-200 flex">
      {/* Mobile Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial="closed"
            animate="open"
            exit="closed"
            variants={overlayVariants}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-20 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={sidebarOpen ? "open" : "closed"}
        variants={sidebarVariants}
        className="fixed lg:static inset-y-0 left-0 z-30 w-64 bg-white shadow-xl border-r border-gray-200 flex flex-col"
      >
        <div className="p-6 border-b border-secondary-200/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 gradient-bg-primary rounded-lg flex items-center justify-center">
              <LayoutDashboard className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gradient-primary">Faculty Portal</h1>
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto custom-scrollbar">
          {visibleModules.map((module, index) => (
            <motion.div
              key={module.path}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Link
                to={module.path}
                onClick={() => window.innerWidth < 1024 && setSidebarOpen(false)}
                className={`group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                  location.pathname === module.path
                    ? 'gradient-bg-primary text-white shadow-medium'
                    : 'text-secondary-700 hover:bg-secondary-100 hover:shadow-soft'
                }`}
              >
                <module.icon className={`w-5 h-5 flex-shrink-0 transition-colors ${
                  location.pathname === module.path ? 'text-white' : 'text-secondary-500 group-hover:text-primary-600'
                }`} />
                <span className="font-medium text-sm">{module.name}</span>
                {location.pathname === module.path && (
                  <motion.div
                    layoutId="activeIndicator"
                    className="ml-auto w-1.5 h-6 bg-white rounded-full"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
              </Link>
            </motion.div>
          ))}
        </nav>

        <div className="border-t border-secondary-200/50 p-4">
          <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-secondary-50/50">
            <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-primary-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-secondary-900 truncate">{profile?.name}</p>
              <p className="text-xs text-secondary-600 truncate">{profile?.department}</p>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800 mt-1">
                {profile?.role_name}
              </span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="btn btn-ghost w-full justify-start text-danger-600 hover:text-danger-700 hover:bg-danger-50"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            <span>Logout</span>
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white shadow-md px-6 py-4 flex items-center justify-between sticky top-0 z-10 border-b border-gray-200">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="btn btn-ghost p-2 text-secondary-600 hover:text-secondary-900 lg:hidden"
              aria-label="Toggle menu"
            >
              <Menu className="w-6 h-6" />
            </button>
            <div>
              <h2 className="text-xl font-semibold text-secondary-900">
                {modules.find(m => m.path === location.pathname)?.name || 'Dashboard'}
              </h2>
              <p className="text-sm text-secondary-600">Welcome back, {profile?.name}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative" ref={notificationRef}>
              <button
                onClick={() => setNotificationOpen(!notificationOpen)}
                className="btn btn-ghost p-2 relative"
              >
                <Bell className="w-5 h-5 text-secondary-600" />
                {notificationCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[20px] h-5 bg-danger-500 text-white text-xs font-semibold rounded-full flex items-center justify-center px-1.5">
                    {notificationCount > 99 ? '99+' : notificationCount}
                  </span>
                )}
              </button>
              
              <AnimatePresence>
                {notificationOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute right-0 mt-2 w-96 bg-white rounded-xl shadow-large border border-secondary-200 overflow-hidden z-50 max-h-[500px] flex flex-col"
                  >
                    <div className="p-4 bg-gradient-to-r from-primary-50 to-accent-50 border-b border-secondary-200">
                      <h3 className="font-semibold text-secondary-900">Notifications</h3>
                      <p className="text-xs text-secondary-600 mt-1">{notificationCount} pending items</p>
                    </div>
                    
                    <div className="overflow-y-auto flex-1">
                      {notifications.length === 0 ? (
                        <div className="p-8 text-center">
                          <Bell className="w-12 h-12 text-secondary-300 mx-auto mb-3" />
                          <p className="text-secondary-500 text-sm">No pending notifications</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-secondary-100">
                          {notifications.map((notif, idx) => (
                            <button
                              key={`${notif.type}-${notif.id}-${idx}`}
                              onClick={() => handleNotificationClick(notif)}
                              className="w-full p-4 hover:bg-secondary-50 transition-colors text-left flex items-start gap-3"
                            >
                              <div className="flex-shrink-0 mt-1">
                                {notif.type === 'USER' && (
                                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                                    <UserPlus className="w-4 h-4 text-blue-600" />
                                  </div>
                                )}
                                {notif.type === 'LEAVE' && (
                                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                                    <Calendar className="w-4 h-4 text-green-600" />
                                  </div>
                                )}
                                {notif.type === 'PRODUCT' && (
                                  <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                                    <Package className="w-4 h-4 text-purple-600" />
                                  </div>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-secondary-900 text-sm">
                                  {notif.type === 'USER' && `New User Registration`}
                                  {notif.type === 'LEAVE' && `Leave Application`}
                                  {notif.type === 'PRODUCT' && `Product Request`}
                                </p>
                                <p className="text-sm text-secondary-700 mt-1 truncate">
                                  {notif.faculty_name}
                                  {notif.type === 'LEAVE' && ` - ${notif.leave_type} (${notif.total_days} days)`}
                                  {notif.type === 'PRODUCT' && ` - ${notif.item_name} (${notif.quantity})`}
                                  {notif.type === 'USER' && ` - ${notif.email}`}
                                </p>
                                <p className="text-xs text-secondary-500 mt-1">
                                  {formatDateTime(notif.created_at)}
                                </p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    {notifications.length > 0 && (
                      <div className="p-3 border-t border-secondary-200 bg-secondary-50">
                        <Link
                          to="/admin/pending"
                          onClick={() => setNotificationOpen(false)}
                          className="text-sm text-primary-600 hover:text-primary-700 font-medium block text-center"
                        >
                          View All Pending Items
                        </Link>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <div className="relative" ref={profileDropdownRef}>
              <button
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                className="flex items-center gap-2 btn btn-ghost p-2 hover:bg-secondary-100 rounded-lg"
              >
                <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                  <User className="w-4 h-4 text-primary-600" />
                </div>
                <ChevronDown className="w-4 h-4 text-secondary-600" />
              </button>
              
              <AnimatePresence>
                {profileDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-large border border-secondary-200 overflow-hidden z-50"
                  >
                    <div className="p-4 bg-gradient-to-r from-primary-50 to-accent-50 border-b border-secondary-200">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-primary-100 rounded-full flex items-center justify-center">
                          <User className="w-6 h-6 text-primary-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-secondary-900 truncate">{profile?.name}</p>
                          <p className="text-sm text-secondary-600 truncate">{profile?.email}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="p-4 space-y-3">
                      <div className="flex items-center justify-between py-2 px-3 bg-secondary-50 rounded-lg">
                        <span className="text-sm text-secondary-600">Department</span>
                        <span className="text-sm font-medium text-secondary-900">{profile?.department}</span>
                      </div>
                      <div className="flex items-center justify-between py-2 px-3 bg-secondary-50 rounded-lg">
                        <span className="text-sm text-secondary-600">Access Level</span>
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-primary-100 text-primary-800">
                          {profile?.role_name}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-2 px-3 bg-secondary-50 rounded-lg">
                        <span className="text-sm text-secondary-600">Faculty Type</span>
                        <span className="text-sm font-medium text-secondary-900">{profile?.faculty_type_name}</span>
                      </div>
                      <div className="flex items-center justify-between py-2 px-3 bg-secondary-50 rounded-lg">
                        <span className="text-sm text-secondary-600">Employee ID</span>
                        <span className="text-sm font-medium text-secondary-900">{profile?.employee_id}</span>
                      </div>
                    </div>
                    
                    <div className="p-3 border-t border-secondary-200">
                      <button
                        onClick={() => {
                          setProfileDropdownOpen(false);
                          handleLogout();
                        }}
                        className="w-full btn btn-ghost justify-start text-danger-600 hover:text-danger-700 hover:bg-danger-50"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Logout</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="max-w-7xl mx-auto"
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
