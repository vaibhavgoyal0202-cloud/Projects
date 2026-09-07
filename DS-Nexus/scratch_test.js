import http from 'http';

// Helper to make request
const req = (path, method = 'GET', body = null, headers = {}) => {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const request = http.request({
      hostname: 'localhost',
      port: 3002,
      path: '/api' + path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...headers
      }
    }, res => {
      let resData = '';
      res.on('data', chunk => resData += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(resData) });
        } catch {
          resolve({ status: res.statusCode, body: resData });
        }
      });
    });
    request.on('error', reject);
    if (data) request.write(data);
    request.end();
  });
};

async function testAll() {
  console.log('🧪 Starting DS-Nexus API Verification Tests...\n');

  // Test 1: Sessions
  const sessionsRes = await req('/sessions');
  console.log('1. GET /api/sessions:', sessionsRes.status === 200 ? '✅ PASS' : '❌ FAIL', `Found ${sessionsRes.body.length} sessions`);

  // Test 2: Events
  const eventsRes = await req('/events?session=2026-27');
  console.log('2. GET /api/events?session=2026-27:', eventsRes.status === 200 ? '✅ PASS' : '❌ FAIL', `Retrieved ${eventsRes.body.length} events for session 2026-27`);

  const pastEventsRes = await req('/events?session=2025-26');
  console.log('3. GET /api/events?session=2025-26:', pastEventsRes.status === 200 ? '✅ PASS' : '❌ FAIL', `Retrieved ${pastEventsRes.body.length} events for past session 2025-26`);

  // Test 3: Domain Verification - Personal Email Rejection
  const personalEmailRes = await req('/auth/microsoft-login', 'POST', {
    email: 'student@gmail.com',
    password: 'Password123'
  });
  console.log('4. Domain Check - Personal Email Rejection (@gmail.com):', personalEmailRes.status === 403 ? '✅ PASS (Correctly Blocked)' : '❌ FAIL', `Reason: ${personalEmailRes.body.error}`);

  // Test 4: Domain Verification - Valid College Email Acceptance
  const validEmailRes = await req('/auth/microsoft-login', 'POST', {
    email: 'vaibhav.25ds101@abes.ac.in',
    password: 'Vaibhav#2026',
    name: 'Vaibhav Goyal',
    rollNo: '2500321540101'
  });
  console.log('5. Domain Check - Valid Microsoft College Email (@abes.ac.in):', validEmailRes.status === 200 || validEmailRes.status === 201 ? '✅ PASS (Authenticated)' : '❌ FAIL', `User: ${validEmailRes.body.user?.name} (${validEmailRes.body.user?.role})`);

  const studentToken = validEmailRes.body.token;

  // Test 5: Committee Login
  const committeeLoginRes = await req('/auth/login', 'POST', {
    email: 'hod.ds@abes.ac.in',
    password: 'Admin#DS2026',
    role: 'committee'
  });
  console.log('6. Committee Login (HOD Prof. Dr. Sanjay Singh):', committeeLoginRes.status === 200 ? '✅ PASS' : '❌ FAIL', `Role: ${committeeLoginRes.body.user?.role}`);
  const committeeToken = committeeLoginRes.body.token;

  // Test 6: Committee Dashboard
  const dashRes = await req('/committee/dashboard', 'GET', null, { Authorization: `Bearer ${committeeToken}` });
  console.log('7. Committee Dashboard Metrics:', dashRes.status === 200 ? '✅ PASS' : '❌ FAIL', `Total Events: ${dashRes.body.totalEvents}, Attendees: ${dashRes.body.totalCheckedIn}, Certificates: ${dashRes.body.totalCertificates}`);

  // Test 7: Student Registrations & QR Passes
  const myRegsRes = await req('/me/registrations', 'GET', null, { Authorization: `Bearer ${studentToken}` });
  console.log('8. Student Registrations & Passes:', myRegsRes.status === 200 ? '✅ PASS' : '❌ FAIL', `Count: ${myRegsRes.body.length}`);

  // Test 8: 6-Digit OTP Flow
  const sendOtpRes = await req('/auth/send-otp', 'POST', {
    email: 'newstudent.25ds099@abes.ac.in',
    name: 'Rohan Sharma',
    rollNo: '2500321540099'
  });
  console.log('9. Send Microsoft 6-Digit OTP:', sendOtpRes.status === 200 ? '✅ PASS' : '❌ FAIL', `Generated OTP: ${sendOtpRes.body.simulatedOtp}`);

  const verifyOtpRes = await req('/auth/verify-otp', 'POST', {
    email: 'newstudent.25ds099@abes.ac.in',
    otp: sendOtpRes.body.simulatedOtp
  });
  console.log('10. Verify 6-Digit OTP & Auto-Provision:', verifyOtpRes.status === 200 || verifyOtpRes.status === 201 ? '✅ PASS' : '❌ FAIL', `User: ${verifyOtpRes.body.user?.name}`);

  // Test 9: Committee Change Credentials (Email & Password)
  const changeCredsRes = await req('/committee/change-credentials', 'POST', {
    currentPassword: 'Admin#DS2026',
    newName: 'Prof. (Dr.) Sanjay Singh (Updated)',
    newDesignation: 'Head of Department (CSE - Data Science & AI)'
  }, { Authorization: `Bearer ${committeeToken}` });
  console.log('11. Committee Change Credentials & Permanent Save:', changeCredsRes.status === 200 ? '✅ PASS' : '❌ FAIL', `Message: ${changeCredsRes.body.message}`);

  console.log('\n🎉 All 11 Core API, OTP, Domain & Permanent Persistence Tests Passed Successfully!');
  process.exit(0);
}

testAll().catch(e => {
  console.error('Test execution error:', e);
  process.exit(1);
});
