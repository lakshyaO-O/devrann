import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionCookie } from '@/lib/verify-session-edge';

const protectedRoutes = [
  '/dashboard', '/practice', '/arena', '/profile', '/settings',
  '/notifications', '/friends', '/chats', '/leaderboard',
  '/projects', '/code-share', '/study-groups', '/mentors',
  '/progress', '/learning', '/achievements', '/missions',
  '/challenges', '/weekly-challenges', '/contests',
  '/problems',
  '/admin', '/admin/',
];

const authRoutes = ['/auth'];

const adminRoutes = ['/admin', '/admin/'];

function isMatching(pathname: string, routes: string[]): boolean {
  return routes.some(route => pathname === route || pathname.startsWith(route + '/'));
}

function getSafeRedirectTarget(request: NextRequest): URL {
  const redirect = request.nextUrl.searchParams.get('redirect');
  if (!redirect || !redirect.startsWith('/') || redirect.startsWith('//') || redirect.includes('\\')) {
    return new URL('/dashboard', request.url);
  }

  const target = new URL(redirect, request.url);
  return target.origin === request.nextUrl.origin
    ? target
    : new URL('/dashboard', request.url);
}

function getAuthRedirect(request: NextRequest): URL {
  const url = new URL('/auth', request.url);
  url.searchParams.set('mode', 'login');
  url.searchParams.set('redirect', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return url;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionCookie = request.cookies.get('__session')?.value;

  const needsSession = isMatching(pathname, protectedRoutes);
  const needsAdmin = isMatching(pathname, adminRoutes);
  const onAuthPage = isMatching(pathname, authRoutes);
  const mustAuthenticate = needsSession || needsAdmin;

  const sessionIsValid = Boolean(
    sessionCookie
    && (mustAuthenticate || onAuthPage)
    && await verifySessionCookie(sessionCookie),
  );

  if (mustAuthenticate && !sessionIsValid) {
    const response = NextResponse.redirect(getAuthRedirect(request));
    if (sessionCookie) response.cookies.set('__session', '', { path: '/', maxAge: 0 });
    return response;
  }

  if (onAuthPage && sessionIsValid) {
    return NextResponse.redirect(getSafeRedirectTarget(request));
  }

  const response = NextResponse.next();

  if (sessionCookie) {
    response.cookies.set('__session', sessionCookie, {
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
    });
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|favicon-16x16.png|favicon-32x32.png|logo.svg|manifest.webmanifest|sw.js|icons/).*)',
  ],
};
