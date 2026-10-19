import React from 'react';
import {TransferPanel} from './TransferPanel.jsx';
export function GroupImportPreview({onClose,onApplied}){return <><div className="modal-body"><TransferPanel kind="csv" onApplied={onApplied}/></div><footer className="modal-footer"><button type="button" onClick={onClose}>Закрыть</button></footer></>;}
