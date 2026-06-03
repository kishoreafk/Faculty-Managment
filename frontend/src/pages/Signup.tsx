import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { motion } from 'framer-motion';
import api from '../utils/api';

export default function Signup() {
  const { register, handleSubmit } = useForm();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [facultyTypes, setFacultyTypes] = useState([]);

  useEffect(() => {
    api.get('/auth/faculty-types').then((res) => setFacultyTypes(res.data));
  }, []);

  const onSubmit = async (data: any) => {
    try {
      await api.post('/auth/register', data);
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Registration failed');
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white p-6 sm:p-8 rounded-2xl shadow-xl max-w-md text-center"
        >
          <div className="text-green-500 text-5xl sm:text-6xl mb-4">✓</div>
          <h2 className="text-xl sm:text-2xl font-bold mb-2">Registration Submitted!</h2>
          <p className="text-sm sm:text-base text-gray-600">Your account is pending admin approval. You'll be notified once approved.</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-5 sm:p-8 rounded-2xl shadow-xl w-full max-w-2xl my-4"
      >
        <h1 className="text-2xl sm:text-3xl font-bold text-center mb-4 sm:mb-6 text-gray-800">Faculty Registration</h1>
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Full Name</label>
            <input {...register('name')} className="w-full px-3 sm:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm sm:text-base" placeholder="John Doe" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Employee ID</label>
            <input {...register('employee_id')} className="w-full px-3 sm:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm sm:text-base" placeholder="EMP001" required />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-1.5">Email</label>
            <input {...register('email')} type="email" className="w-full px-3 sm:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm sm:text-base" placeholder="john.doe@university.edu" required />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-1.5">Password</label>
            <input {...register('password')} type="password" className="w-full px-3 sm:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm sm:text-base" placeholder="Minimum 6 characters" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Faculty Type</label>
            <select {...register('faculty_type_id')} className="w-full px-3 sm:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm sm:text-base" required>
              <option value="">Select Type</option>
              {facultyTypes.map((ft: any) => (
                <option key={ft.id} value={ft.id}>{ft.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Department</label>
            <input {...register('department')} className="w-full px-3 sm:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm sm:text-base" placeholder="Computer Science" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Designation</label>
            <input {...register('designation')} className="w-full px-3 sm:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm sm:text-base" placeholder="Assistant Professor" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Date of Joining</label>
            <input {...register('doj')} type="date" className="w-full px-3 sm:px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm sm:text-base" required />
          </div>
          {error && <p className="sm:col-span-2 text-red-500 text-sm bg-red-50 p-3 rounded">{error}</p>}
          <button type="submit" className="sm:col-span-2 bg-blue-600 text-white py-2.5 sm:py-3 rounded-lg hover:bg-blue-700 transition font-medium text-sm sm:text-base">
            Register
          </button>
        </form>
        <p className="text-center mt-4 sm:mt-6 text-xs sm:text-sm text-gray-600">
          Already have an account? <Link to="/login" className="text-blue-600 hover:underline font-medium">Login</Link>
        </p>
      </motion.div>
    </div>
  );
}
