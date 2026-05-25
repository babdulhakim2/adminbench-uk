module.exports = [
  {
    id: 'client-instruction',
    caseId: 'ad01-001',
    title: 'Client instruction email',
    type: 'Email',
    source: 'Client services mailbox',
    body: `
      <p><strong>From:</strong> Priya Shah, Company Secretary</p>
      <p><strong>To:</strong> Northbridge Coffee Roasters Limited account team</p>
      <p><strong>Date:</strong> 12 May 2026</p>
      <p>Please file an AD01 to change our registered office address.</p>
      <p>The company details are:</p>
      <ul>
        <li>Company name: Northbridge Coffee Roasters Limited</li>
        <li>Company number: 12345678</li>
        <li>Companies House authentication code: ZXCV1234</li>
      </ul>
      <p>The new registered office address is Suite 12, Albion Works, 18 Pollard Street, Manchester, M4 7AJ.</p>
      <p>Please prepare the filing, but do not submit it until I approve the final answers.</p>
    `
  },
  {
    id: 'board-resolution',
    caseId: 'ad01-001',
    title: 'Board resolution extract',
    type: 'Resolution',
    source: 'Board pack',
    body: `
      <p><strong>Company:</strong> Northbridge Coffee Roasters Limited</p>
      <p><strong>Meeting date:</strong> 8 May 2026</p>
      <p>The directors resolved that the registered office of the company be changed from Unit 4, Old Mill Yard, Bramley Road, Leeds, LS1 4AB to Suite 12, Albion Works, 18 Pollard Street, Manchester, M4 7AJ.</p>
      <p>The company is registered in England and Wales. The new address is in England.</p>
    `
  },
  {
    id: 'office-confirmation',
    caseId: 'ad01-001',
    title: 'Office provider confirmation',
    type: 'Letter',
    source: 'Albion Works reception services',
    body: `
      <p><strong>Provider:</strong> Albion Works Management Limited</p>
      <p>We confirm that Northbridge Coffee Roasters Limited may use Suite 12, Albion Works, 18 Pollard Street, Manchester, M4 7AJ as its registered office address.</p>
      <p>Documents delivered to this address will be brought to the attention of a person acting on behalf of the company.</p>
    `
  }
]
