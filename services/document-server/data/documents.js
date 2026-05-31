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
  },
  {
    id: 'ad01-002-client-instruction',
    caseId: 'ad01-002',
    title: 'Client instruction email',
    type: 'Email',
    source: 'Client services mailbox',
    body: `
      <p><strong>From:</strong> James Okafor, Director</p>
      <p><strong>To:</strong> Harlow &amp; Briggs Consulting Ltd account team</p>
      <p><strong>Date:</strong> 19 May 2026</p>
      <p>Please file an AD01 to change our registered office address with Companies House.</p>
      <p>The company details are:</p>
      <ul>
        <li>Company name: Harlow &amp; Briggs Consulting Ltd</li>
        <li>Company number: 09182736</li>
        <li>Companies House authentication code: HJKL5678</li>
      </ul>
      <p>Please use the attached board resolution and lease agreement to confirm the new address and prepare the filing. Do not submit until I have reviewed and approved the final answers.</p>
    `
  },
  {
    id: 'ad01-002-board-resolution',
    caseId: 'ad01-002',
    title: 'Board resolution extract',
    type: 'Resolution',
    source: 'Board pack',
    body: `
      <p><strong>Company:</strong> Harlow &amp; Briggs Consulting Ltd</p>
      <p><strong>Meeting date:</strong> 14 May 2026</p>
      <p>The directors resolved that the registered office of the company be changed to Unit 7, Harlow House, 23 Canfield Road, Bristol, BS1 5TN.</p>
      <p>The company is registered in England and Wales. The new address is in England.</p>
    `
  },
  {
    id: 'ad01-002-lease-agreement',
    caseId: 'ad01-002',
    title: 'Lease agreement extract',
    type: 'Lease',
    source: 'Property services',
    body: `
      <p><strong>Landlord:</strong> Canfield Road Properties Ltd</p>
      <p><strong>Tenant:</strong> Harlow &amp; Briggs Consulting Ltd</p>
      <p><strong>Premises:</strong> Unit 7, Harlow Business Centre, 23 Canfield Road, Bristol, BS1 5TN</p>
      <p><strong>Term:</strong> 3 years from 1 June 2026</p>
      <p>This lease confirms occupation of the above premises from the commencement date.</p>
    `
  },
  {
    id: 'ad01-003-client-instruction',
    caseId: 'ad01-003',
    title: 'Client instruction email',
    type: 'Email',
    source: 'Client services mailbox',
    body: `
      <p><strong>From:</strong> Rachel Obi, Managing Partner</p>
      <p><strong>To:</strong> Castleton Advisory Partners Ltd account team</p>
      <p><strong>Date:</strong> 2 June 2026</p>
      <p>Please file an AD01 to change our registered office address with Companies House.</p>
      <p>The company details are:</p>
      <ul>
        <li>Company name: Castleton Advisory Partners Ltd</li>
        <li>Company number: 07364821</li>
        <li>Companies House authentication code: MNOP9012</li>
      </ul>
      <p>The new address is Unit 3, Finsbury Court, 14 Worship Street, London, EC2A 4NE.</p>
      <p>Please prepare the filing using the attached board resolution. Do not submit until I have reviewed and approved the final answers.</p>
    `
  },
  {
    id: 'ad01-003-board-resolution',
    caseId: 'ad01-003',
    title: 'Board resolution extract',
    type: 'Resolution',
    source: 'Board pack',
    body: `
      <p><strong>Company:</strong> Castleton Advisory Partners Ltd</p>
      <p><strong>Meeting date:</strong> 28 May 2026</p>
      <p>The directors resolved that the registered office of the company be changed to Unit 3, Finsbury Court, 14 Worship Street, London, EC2A 4NF.</p>
      <p>The company is registered in England and Wales. The new address is in England.</p>
    `
  },
  {
    id: 'vat-client-instruction',
    caseId: 'vat-001',
    title: 'Client instruction email',
    type: 'Email',
    source: 'Tax mailbox',
    body: `
      <p><strong>From:</strong> Maya Patel, Finance Director</p>
      <p><strong>To:</strong> Green Lane Studio Ltd account team</p>
      <p><strong>Date:</strong> 29 April 2026</p>
      <p>Please prepare our VAT return for the period 1 January 2026 to 31 March 2026.</p>
      <p>The VAT registration number is GB123456789. We use standard VAT accounting and have no EU goods movements for this period.</p>
      <p>Please use the VAT workings prepared by the bookkeeper. Do not submit the return until I approve the final answers.</p>
    `
  },
  {
    id: 'vat-workings-summary',
    caseId: 'vat-001',
    title: 'VAT workings summary',
    type: 'Spreadsheet extract',
    source: 'Bookkeeping system export',
    body: `
      <p><strong>Business:</strong> Green Lane Studio Ltd</p>
      <p><strong>Period:</strong> 1 January 2026 to 31 March 2026</p>
      <table>
        <tbody>
          <tr><th scope="row">Box 1 VAT due on sales and other outputs</th><td>8400.00</td></tr>
          <tr><th scope="row">Box 2 VAT due on acquisitions from EU member states</th><td>0.00</td></tr>
          <tr><th scope="row">Box 3 total VAT due</th><td>8400.00</td></tr>
          <tr><th scope="row">Box 4 VAT reclaimed on purchases</th><td>2150.00</td></tr>
          <tr><th scope="row">Box 5 net VAT to pay</th><td>6250.00</td></tr>
          <tr><th scope="row">Box 6 total value of sales excluding VAT</th><td>42000</td></tr>
          <tr><th scope="row">Box 7 total value of purchases excluding VAT</th><td>10750</td></tr>
          <tr><th scope="row">Box 8 EU goods supplied from Northern Ireland</th><td>0</td></tr>
          <tr><th scope="row">Box 9 EU goods acquired into Northern Ireland</th><td>0</td></tr>
        </tbody>
      </table>
    `
  },
  {
    id: 'vat-ledger-review',
    caseId: 'vat-001',
    title: 'Ledger review note',
    type: 'Working paper',
    source: 'Bookkeeper review',
    body: `
      <p>The sales ledger total for the period is £42,000 excluding VAT. Output tax at 20% is £8,400.</p>
      <p>The purchase ledger includes valid VAT invoices supporting input tax of £2,150 on purchases with a net value of £10,750.</p>
      <p>No reverse charge transactions, flat rate scheme adjustments, or EU goods movements were identified.</p>
    `
  },
  {
    id: 'ico-client-instruction',
    caseId: 'ico-001',
    title: 'Client instruction email',
    type: 'Email',
    source: 'Compliance mailbox',
    body: `
      <p><strong>From:</strong> Dr Amira Khan, Practice Principal</p>
      <p><strong>To:</strong> Data protection support team</p>
      <p><strong>Date:</strong> 21 May 2026</p>
      <p>We became aware at 09:20 today that a payroll spreadsheet was sent to the wrong external recipient yesterday afternoon.</p>
      <p>Please prepare an ICO personal data breach notification for Brightwell Dental Care Ltd. Our ICO registration number is ZA123456.</p>
      <p>Use me as the contact point and do not submit the notification until I approve the final answers.</p>
    `
  },
  {
    id: 'ico-incident-report',
    caseId: 'ico-001',
    title: 'Incident report',
    type: 'Incident log',
    source: 'Internal breach log',
    body: `
      <p><strong>Organisation:</strong> Brightwell Dental Care Ltd</p>
      <p><strong>Incident date and time:</strong> 20 May 2026 at 16:45</p>
      <p><strong>Awareness date and time:</strong> 21 May 2026 at 09:20</p>
      <p>A payroll spreadsheet was emailed to an incorrect external recipient because an autocomplete address was selected. The spreadsheet related to 38 staff members.</p>
      <p>The recipient confirmed deletion at 10:05 on 21 May 2026 and stated that the attachment was not forwarded.</p>
    `
  },
  {
    id: 'ico-risk-assessment',
    caseId: 'ico-001',
    title: 'DPO risk assessment',
    type: 'Assessment',
    source: 'Data protection officer',
    body: `
      <p>The spreadsheet included names, home addresses, bank account details, National Insurance numbers and salary information.</p>
      <p>No special category health data was included, but the payroll and bank details mean the likely risk to individuals is high.</p>
      <p>Affected staff were notified on 21 May 2026. The mailbox autocomplete list was cleared, finance staff received a reminder, and the payroll export process was restricted to named reviewers.</p>
    `
  }
]
