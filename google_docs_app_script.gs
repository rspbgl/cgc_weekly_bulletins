// CONFIGURATION
const GITHUB_CONFIG = {
  owner: 'rspbgl',      // e.g., 'ravinkumar'
  repo: 'cgc_weekly_bulletins',       // e.g., 'church-website'
  branch: 'main',                     // Target branch
  folderPath: 'bulletins'             // Folder path inside GitHub repo
};

/**
 * Creates custom menu when opening the Google Doc
 */
function onOpen() {
  DocumentApp.getUi()
    .createMenu('Church Bulletin')
    .addItem('Export Active Tab to GitHub', 'exportActiveTabToGitHub')
    .addItem('Email Active Tab as PDF', 'emailActiveTabToMe')
    .addToUi();
}

/**
 * NEW FEATURE: Converts active tab to PDF and emails it to your Gmail
 */
function emailActiveTabToMe() {
  const ui = DocumentApp.getUi();
  
  try {
    const doc = DocumentApp.getActiveDocument();
    
    // Get currently focused tab
    const activeTab = doc.getActiveTab();
    if (!activeTab) {
      ui.alert('Error', 'Could not detect an active tab. Please click inside the tab you want to email.', ui.ButtonSet.OK);
      return;
    }

    const tabName = activeTab.getTitle();
    
    // Get the email address of the person running the script
    const recipientEmail = Session.getActiveUser().getEmail();
    
    if (!recipientEmail) {
      ui.alert('Error', 'Could not detect your Google Account email address.', ui.ButtonSet.OK);
      return;
    }

    // 1. Create PDF from active tab
    const pdfBlob = createPdfFromTab(activeTab, tabName);

    // 2. Send email via Google Apps Script MailApp
    MailApp.sendEmail({
      to: recipientEmail,
      subject: `Church Bulletin: ${tabName}`,
      body: `\n\nAttached is the PDF export for the active tab: "${tabName}".\n\nSent from Google Docs Automation.`,
      attachments: [pdfBlob]
    });

    ui.alert('Email Sent!', `The PDF for "${tabName}" has been sent to ${recipientEmail}.`, ui.ButtonSet.OK);

  } catch (error) {
    ui.alert('Email Failed', error.toString(), ui.ButtonSet.OK);
  }
}

/**
 * Main Trigger: Converts current active tab to PDF and uploads to GitHub
 */
function exportActiveTabToGitHub() {
  const ui = DocumentApp.getUi();
  
  try {
    const doc = DocumentApp.getActiveDocument();
    
    const activeTab = doc.getActiveTab();
    if (!activeTab) {
      ui.alert('Error', 'Could not detect an active tab. Please click inside the tab you want to export.', ui.ButtonSet.OK);
      return;
    }

    const tabName = activeTab.getTitle();
    
    const response = ui.alert(
      'Confirm Export',
      `Are you sure you want to export tab "${tabName}" to GitHub?`,
      ui.ButtonSet.YES_NO
    );
    
    if (response !== ui.Button.YES) return;

    const pdfBlob = createPdfFromTab(activeTab, tabName);
    const sanitizedFileName = tabName.replace(/[^a-zA-Z0-9\-_]/g, '_');
    const githubFilePath = `${GITHUB_CONFIG.folderPath}/${sanitizedFileName}.pdf`;

    pushPdfToGitHub(pdfBlob, githubFilePath, tabName);
    
    ui.alert('Success!', `Bulletin "${tabName}" has been successfully pushed to GitHub!\n\nPath: ${githubFilePath}`, ui.ButtonSet.OK);

  } catch (error) {
    ui.alert('Export Failed', error.toString(), ui.ButtonSet.OK);
  }
}

/**
 * Extracts elements from a single tab and generates a standalone PDF
 */
function createPdfFromTab(tab, tabName) {
  const tabDoc = tab.asDocumentTab();
  const tabBody = tabDoc.getBody();
  
  const tempDoc = DocumentApp.create(`Temp_${tabName}`);
  const tempBody = tempDoc.getBody();
  
  // 1. Copy Footer if present in source tab
  const footer = tabDoc.getFooter();
  if (footer) {
    const tempFooter = tempDoc.addFooter();
    const footerChildren = footer.getNumChildren();
    for (let i = 0; i < footerChildren; i++) {
      const child = footer.getChild(i).copy();
      const type = child.getType();
      
      if (type === DocumentApp.ElementType.PARAGRAPH) {
        tempFooter.appendParagraph(child.asParagraph());
      } else if (type === DocumentApp.ElementType.TABLE) {
        tempFooter.appendTable(child.asTable());
      } else if (type === DocumentApp.ElementType.LIST_ITEM) {
        tempFooter.appendListItem(child.asListItem());
      }
    }
    if (tempFooter.getNumChildren() > 1 && tempFooter.getChild(0).asText().getText() === "") {
      tempFooter.removeChild(tempFooter.getChild(0));
    }
    
    // WORKAROUND: Find all FOOTER_SECTION elements in doc parent and clear first-page footer if present
    const docParent = tempBody.getParent();
    for (let i = 0; i < docParent.getNumChildren(); i++) {
      const child = docParent.getChild(i);
      if (child.getType() === DocumentApp.ElementType.FOOTER_SECTION) {
        // If there are multiple footer sections, the first one corresponds to Page 1
        if (i > 0 && docParent.getChild(i - 1).getType() === DocumentApp.ElementType.FOOTER_SECTION) {
          child.asFooterSection().clear();
        }
      }
    }
  }

  // 2. Copy Body elements
  const numChildren = tabBody.getNumChildren();
  for (let i = 0; i < numChildren; i++) {
    const child = tabBody.getChild(i).copy();
    const type = child.getType();
    
    if (type === DocumentApp.ElementType.PARAGRAPH) {
      tempBody.appendParagraph(child.asParagraph());
    } else if (type === DocumentApp.ElementType.TABLE) {
      tempBody.appendTable(child.asTable());
    } else if (type === DocumentApp.ElementType.LIST_ITEM) {
      tempBody.appendListItem(child.asListItem());
    }
  }
  
  if (tempBody.getNumChildren() > 1) {
    tempBody.removeChild(tempBody.getChild(0));
  }
  
  tempDoc.saveAndClose();

const docId = tempDoc.getId();
Docs.Documents.batchUpdate({
  requests: [{
    updateDocumentStyle: {
      documentStyle: { useFirstPageHeaderFooter: true },
      fields: 'useFirstPageHeaderFooter'
    }
  }]
}, docId);
  
  const tempFile = DriveApp.getFileById(tempDoc.getId());
  const pdfBlob = tempFile.getAs('application/pdf').setName(`${tabName}.pdf`);
  
  tempFile.setTrashed(true);
  
  return pdfBlob;
}

/**
 * Commits file to GitHub API v3
 */
function pushPdfToGitHub(pdfBlob, filePath, tabName) {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) {
    throw new Error('GITHUB_TOKEN script property is missing. Please set it in Project Settings.');
  }

  const url = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${filePath}`;
  const base64Content = Utilities.base64Encode(pdfBlob.getBytes());
  
  let sha = null;
  const getOptions = {
    method: 'get',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    },
    muteHttpExceptions: true
  };
  
  const checkResponse = UrlFetchApp.fetch(`${url}?ref=${GITHUB_CONFIG.branch}`, getOptions);
  if (checkResponse.getResponseCode() === 200) {
    const fileData = JSON.parse(checkResponse.getContentText());
    sha = fileData.sha;
  }

  const payload = {
    message: `Church Bulletin: Publish ${tabName}`,
    content: base64Content,
    branch: GITHUB_CONFIG.branch
  };
  
  if (sha) payload.sha = sha;

  const putOptions = {
    method: 'put',
    contentType: 'application/json',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    },
    payload: JSON.stringify(payload)
  };

  const response = UrlFetchApp.fetch(url, putOptions);
  
  if (response.getResponseCode() !== 200 && response.getResponseCode() !== 201) {
    throw new Error(`GitHub API Error (${response.getResponseCode()}): ${response.getContentText()}`);
  }
}
