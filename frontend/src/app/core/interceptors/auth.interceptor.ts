import { HttpInterceptorFn } from '@angular/common/http';

// Sends the httpOnly cookie (Google sign-in flow) and the bearer token (email sign-in flow).
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = localStorage.getItem('zp_token');
  const cloned = req.clone({
    withCredentials: true,
    ...(token ? { setHeaders: { Authorization: `Bearer ${token}` } } : {})
  });
  return next(cloned);
};
