/**
 * Community ciphers for Spaces.
 */
export const ciphers = {
    title: 'Ciphers',
    subtitle: 'Manage your community ciphers for encrypted Spaces.',
    addButton: 'Add Cipher',
    exportBackup: 'Export',
    importBackup: 'Import',
    notLoggedIn: 'Please log in to your alias to manage ciphers.',
    sessionLocked: 'Your session is locked. Enter your password to unlock and view your ciphers.',

    // Empty state
    empty: {
      title: 'No Ciphers Yet',
      description: 'Ciphers are shared encryption keys for Spaces. Add a cipher to join or create encrypted communities.',
      addFirst: 'Add Your First Cipher',
    },

    // Cipher card
    card: {
      cipherId: 'Cipher ID',
      created: 'Created',
      entropyPieces: 'Entropy Pieces',
    },

    // Add cipher modal
    addModal: {
      title: 'Add New Cipher',
      description: 'Create a cipher from one or more secret phrases. Anyone who knows the same phrases can derive the same cipher.',
      nameLabel: 'Cipher Name',
      namePlaceholder: 'e.g., My Community',
      nameHint: 'A friendly name to identify this cipher.',
      entropyLabel: 'Secret Phrases',
      entropyRowPlaceholder: 'Enter a secret phrase...',
      entropyHint: 'These phrases are combined to derive the cipher. Order matters.',
      addEntropy: 'Add another phrase',
      securityTitle: 'Security Note',
      securityWarning: 'Anyone who knows these phrases can decrypt messages encrypted with this cipher. Keep them secret and share only with trusted community members.',
      submit: 'Create Cipher',
    },

    // Delete modal
    deleteModal: {
      title: 'Delete Cipher',
      message: 'Are you sure you want to delete "{{name}}"? You will lose access to any messages encrypted with this cipher unless you re-add it with the same entropy.',
    },

    // Edit modal
    editModal: {
      title: 'Edit Cipher',
      tabs: {
        details: 'Details',
        entropy: 'Secret Phrases',
      },
      nameLabel: 'Cipher Name',
      namePlaceholder: 'e.g., My Community',
      spaceIdLabel: 'Space ID',
      spaceIdPlaceholder: 'Optional: Associated space',
      epochIdLabel: 'Epoch ID',
      epochIdPlaceholder: 'Optional: Epoch identifier',
      entropyLabel: 'Secret Phrases',
      entropyRowPlaceholder: 'Enter a secret phrase...',
      entropyHint: 'These phrases are combined to derive the cipher. Order matters.',
      addEntropy: 'Add another phrase',
      entropyWarningTitle: 'Changing Entropy Warning',
      entropyWarning: 'Modifying these phrases will change the cipher key. Any content encrypted with the previous cipher will NOT be decryptable with the new one. This is expected for epoch rotation.',
      save: 'Save Changes',
      saving: 'Saving...',
    },

    // Share modal
    shareModal: {
      title: 'Share Cipher',
      warningTitle: 'Security Warning',
      warningMessage: 'You are about to share this cipher\'s secret phrases. Anyone who receives these phrases will be able to decrypt all messages encrypted with this cipher. Only share with people you trust.',
      warningBullets: [
        'These phrases grant full access to encrypted content',
        'Cannot be revoked once shared',
        'Share only with trusted community members',
      ],
      consentLabel: 'I understand the security implications',
      continueButton: 'Continue to Share',
      qrTitle: 'Scan QR Code',
      qrDescription: 'Have the recipient scan this QR code to add the cipher.',
      copyTitle: 'Copy Phrases',
      copyDescription: 'Copy the secret phrases to share manually.',
      copyButton: 'Copy to Clipboard',
      copied: 'Copied!',
      phraseLabel: 'Phrase {{index}}',
    },

    // Duplicate modal
    duplicateModal: {
      title: 'Duplicate Cipher',
      description: 'Create a copy of this cipher with a new name. The copy will have the same entropy and will derive the same cipher key.',
      nameLabel: 'New Name',
      namePlaceholder: 'e.g., {{name}} (Copy)',
      submit: 'Create Copy',
    },

    // Messages
    messages: {
      created: 'Cipher created successfully.',
      deleted: 'Cipher deleted.',
      renamed: 'Cipher renamed.',
      updated: 'Cipher updated successfully.',
      duplicated: 'Cipher duplicated successfully.',
      copied: 'Copied to clipboard.',
    },

    // Errors
    errors: {
      noEntropy: 'Please enter at least one secret phrase.',
      createFailed: 'Failed to create cipher.',
      deleteFailed: 'Failed to delete cipher.',
      renameFailed: 'Failed to rename cipher.',
      updateFailed: 'Failed to update cipher.',
      duplicateFailed: 'Failed to duplicate cipher.',
      copyFailed: 'Failed to copy to clipboard.',
    },
} as const;
