// Test /api/start endpoint with Firecrawl research
async function testApi() {
  console.log('Sending POST request to http://localhost:3000/api/start...');
  const res = await fetch('http://localhost:3000/api/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      company: 'Google',
      role: 'Frontend Engineer',
      jobDescription: 'We are looking for a Senior Frontend Engineer with 5+ years experience in React, JavaScript, HTML, CSS, performance optimization, and web accessibility. Must have experience building scalable applications.',
      resumeText: 'John Doe. Senior Software Engineer with 6 years experience in React, JavaScript, TypeScript, HTML/CSS, Node.js, and performance tuning. Built high-traffic web applications for millions of users at scale.',
      count: 4
    })
  });

  const data = await res.json();
  console.log('HTTP Status:', res.status);
  console.log('Sources returned:', data.sources?.length || 0);

  if (data.sources?.length) {
    console.log('\n--- Sources List ---');
    data.sources.forEach((s, i) => console.log(`${i+1}. [${s.title}] (${s.url})`));
  }

  if (data.questions?.length) {
    console.log('\n--- Generated Questions ---');
    data.questions.forEach((q, i) => console.log(`${i+1}. [${q.type}] ${q.question}`));
  }

  if (data.error) {
    console.error('Error:', data.error);
  }
}

testApi().catch(err => console.error('Test error:', err.message));
