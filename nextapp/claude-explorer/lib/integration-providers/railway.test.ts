const API = "https://backboard.railway.com/graphql/v2";
const TOKEN = "e8c8fd98-8bf8-4df2-87ca-868fa78bcf70";
const PROJECT_ID = "1661adbc-6bb3-4982-850f-63af92988a74";

async function query(label: string, q: string, vars?: Record<string, unknown>) {
  console.log(`\n--- ${label} ---`);
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ query: q, variables: vars }),
  });
  const json = await res.json();
  console.log(JSON.stringify(json, null, 2));
}

async function test() {
  // Deployments with meta as scalar + staticUrl
  await query(
    "deployments with meta+url",
    `
    query($projectId: String!) {
      project(id: $projectId) {
        deployments(first: 3) {
          edges {
            node {
              id status createdAt
              meta staticUrl url
              service { name }
            }
          }
        }
      }
    }
  `,
    { projectId: PROJECT_ID }
  );
}

void test();
