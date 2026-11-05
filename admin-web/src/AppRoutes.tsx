import { AuthProvider } from './auth/AuthProvider';
import AppLayout from './layout/AppLayout';

export default function AppRoutes() {
  return <AuthProvider><AppLayout /></AuthProvider>;
}
