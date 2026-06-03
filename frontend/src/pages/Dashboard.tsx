import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar, FileText, Upload, Package, TrendingUp, Users, Clock, CheckCircle } from 'lucide-react';
import api from '../utils/api';
import { useAsync } from '../hooks/useAsync';
import { Spinner, ErrorBlock } from '../components/shared/Feedback';

export default function Dashboard() {
  const { data: profile, loading: loadingProfile, error: errorProfile, refresh: refreshProfile } = useAsync(
    (signal) => api.get('/auth/profile', { signal }).then(r => r.data),
    []
  );

  const { data: summary, loading: loadingSummary, error: errorSummary, refresh: refreshSummary } = useAsync(
    (signal) => api.get('/dashboard/summary', { signal }).then(r => r.data),
    []
  );

  if (loadingProfile || loadingSummary) return <Spinner className="min-h-[400px]" />;
  if (errorProfile) return <ErrorBlock message={errorProfile} onRetry={refreshProfile} />;
  if (errorSummary) return <ErrorBlock message={errorSummary} onRetry={refreshSummary} />;
  if (!profile || !summary) return null;

  const isAdmin = profile?.role_name === 'ADMIN' || profile?.role_name === 'SUPER_ADMIN';

  const statsCards = [
    ...(isAdmin && ((summary?.pendingLeaveCount || 0) + (summary?.pendingProductRequestsCount || 0) + (summary?.pendingFacultyCount || 0)) > 0 ? [{
      title: 'Pending Actions',
      icon: Clock,
      color: 'text-primary-600',
      bgColor: 'bg-primary-50',
      content: (
        <div className="space-y-2">
          {(summary?.pendingLeaveCount || 0) > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-secondary-700">Leave Requests</span>
              <span className="font-semibold text-secondary-900">{summary.pendingLeaveCount}</span>
            </div>
          )}
          {(summary?.pendingProductRequestsCount || 0) > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-secondary-700">Product Requests</span>
              <span className="font-semibold text-secondary-900">{summary.pendingProductRequestsCount}</span>
            </div>
          )}
          {(summary?.pendingFacultyCount || 0) > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-secondary-700">Faculty Approvals</span>
              <span className="font-semibold text-secondary-900">{summary.pendingFacultyCount}</span>
            </div>
          )}
        </div>
      )
    }] : []),
    ...(!isAdmin ? [{
      title: 'Leave Balances',
      icon: Calendar,
      color: 'text-primary-600',
      bgColor: 'bg-primary-50',
      content: summary?.leaveBalances?.slice(0, 3).map((lb: any) => (
        <div key={lb.leave_type_id} className="flex justify-between items-center py-1">
          <span className="text-sm text-secondary-700">{lb.code}</span>
          <span className="font-semibold text-secondary-900">{lb.available} days</span>
        </div>
      ))
    }] : []),
    ...(!isAdmin ? [
      {
        title: 'Pending Product Requests',
        icon: Package,
        color: 'text-warning-600',
        bgColor: 'bg-warning-50',
        value: summary?.pendingProductRequestsCount || 0
      },
      {
        title: 'My Leave Requests',
        icon: FileText,
        color: 'text-accent-600',
        bgColor: 'bg-accent-50',
        value: summary?.pendingLeaveCount || 0,
        trend: summary?.pendingLeaveCount > 0 ? 'Needs Review' : 'All Clear'
      }
    ] : [])
  ].filter(Boolean);

  const quickAccessModules = [
    { name: 'Leave Management', icon: Calendar, path: '/leave', gradient: 'gradient-bg-primary', roles: ['HOD', 'FACULTY'] },
    { name: 'Product Requests', icon: Package, path: '/products', gradient: 'gradient-bg-secondary', roles: ['HOD', 'FACULTY'] },
    { name: 'Vaultify', icon: Upload, path: '/vaultify', gradient: 'gradient-bg-accent', roles: ['HOD', 'FACULTY'] },
    { name: 'Timetable', icon: Clock, path: '/timetable', gradient: 'gradient-bg-primary', roles: ['HOD', 'FACULTY'] }
  ];

  const actionRequiredModules = [
    { 
      name: 'Pending Faculty Approvals', 
      icon: Users, 
      path: '/admin/approvals', 
      gradient: 'gradient-bg-secondary', 
      count: summary?.pendingFacultyCount || 0
    },
    { 
      name: 'Pending Leave Approvals', 
      icon: CheckCircle, 
      path: '/admin/leave-review', 
      gradient: 'gradient-bg-accent', 
      count: summary?.pendingLeaveCount || 0
    },
    { 
      name: 'Pending Product Reviews', 
      icon: Package, 
      path: '/admin/product-reviews', 
      gradient: 'gradient-bg-primary', 
      count: summary?.pendingProductRequestsCount || 0
    }
  ];

  const visibleQuickAccess = (profile?.role_name === 'ADMIN' || profile?.role_name === 'SUPER_ADMIN')
    ? actionRequiredModules.filter(m => m.count > 0)
    : quickAccessModules.filter(m => !m.roles || m.roles.includes(profile?.role_name));

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center py-8"
      >
        <h1 className="text-3xl font-bold text-secondary-900 mb-2">
          Welcome back, <span className="text-gradient-primary">{profile?.name}</span>
        </h1>
        <p className="text-secondary-600">Here's what's happening with your faculty portal today.</p>
      </motion.div>

      {/* Stats Cards */}
      {summary && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {statsCards.map((card, index) => (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 + 0.2 }}
              className="card p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`p-3 rounded-xl ${card.bgColor}`}>
                  <card.icon className={`w-6 h-6 ${card.color}`} />
                </div>
              </div>
              <h3 className="text-sm font-medium text-secondary-600 mb-2">{card.title}</h3>
              {card.value !== undefined ? (
                <div className="text-3xl font-bold text-secondary-900">{card.value}</div>
              ) : (
                <div className="space-y-1 mt-3">{card.content}</div>
              )}
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Action Required / Quick Access */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex items-center gap-3 mb-6">
          <TrendingUp className="w-6 h-6 text-primary-600" />
          <h2 className="text-2xl font-semibold text-secondary-900">
            {profile?.role_name === 'ADMIN' || profile?.role_name === 'SUPER_ADMIN' ? 'Action Required' : 'Quick Access'}
          </h2>
        </div>
        {visibleQuickAccess.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {visibleQuickAccess.map((module, idx) => (
              <motion.div
                key={module.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 + 0.4 }}
                whileHover={{ y: -4 }}
                whileTap={{ scale: 0.98 }}
              >
                <Link
                  to={module.path}
                  className={`${module.gradient} text-white p-6 rounded-xl shadow-medium hover:shadow-large transition-all duration-200 block group`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <module.icon className="w-8 h-8 group-hover:scale-110 transition-transform" />
                    {'count' in module && module.count !== undefined && (
                      <span className="bg-white/20 text-white font-bold text-lg px-3 py-1 rounded-full">
                        {module.count}
                      </span>
                    )}
                  </div>
                  <h3 className="text-lg font-semibold mb-1">{module.name}</h3>
                  <p className="text-white/80 text-sm">Click to review</p>
                </Link>
              </motion.div>
            ))}
          </div>
        ) : (
          (profile?.role_name === 'ADMIN' || profile?.role_name === 'SUPER_ADMIN') && (
            <div className="text-center py-8 text-secondary-600">
              <CheckCircle className="w-12 h-12 mx-auto mb-3 text-success-500" />
              <p className="text-lg">No pending actions required</p>
            </div>
          )
        )}
      </motion.div>
    </div>
  );
}
