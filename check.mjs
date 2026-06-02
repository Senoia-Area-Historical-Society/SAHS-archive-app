async function check() {
    const res = await fetch('https://api.github.com/repos/Senoia-Area-Historical-Society/SAHS-archive-app/actions/runs');
    const data = await res.json();
    console.log(data.workflow_runs.slice(0, 3).map(r => ({ status: r.status, conclusion: r.conclusion, message: r.head_commit.message })));
}
check();
