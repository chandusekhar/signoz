/* eslint-disable react/jsx-props-no-spreading */
import './ExplorerOptions.styles.scss';

import { InfoCircleOutlined } from '@ant-design/icons';
import { Color } from '@signozhq/design-tokens';
import {
	Button,
	ColorPicker,
	Divider,
	Input,
	InputRef,
	Modal,
	RefSelectProps,
	Select,
	Tooltip,
	Typography,
} from 'antd';
import logEvent from 'api/common/logEvent';
import axios from 'axios';
import cx from 'classnames';
import { getViewDetailsUsingViewKey } from 'components/ExplorerCard/utils';
import { SOMETHING_WENT_WRONG } from 'constants/api';
import { LOCALSTORAGE } from 'constants/localStorage';
import { QueryParams } from 'constants/query';
import { PANEL_TYPES } from 'constants/queryBuilder';
import ROUTES from 'constants/routes';
import ExportPanelContainer from 'container/ExportPanel/ExportPanelContainer';
import { useGetSearchQueryParam } from 'hooks/queryBuilder/useGetSearchQueryParam';
import { useQueryBuilder } from 'hooks/queryBuilder/useQueryBuilder';
import { useGetAllViews } from 'hooks/saveViews/useGetAllViews';
import { useSaveView } from 'hooks/saveViews/useSaveView';
import { useUpdateView } from 'hooks/saveViews/useUpdateView';
import { useIsDarkMode } from 'hooks/useDarkMode';
import useErrorNotification from 'hooks/useErrorNotification';
import { useHandleExplorerTabChange } from 'hooks/useHandleExplorerTabChange';
import { useNotifications } from 'hooks/useNotifications';
import { mapCompositeQueryFromQuery } from 'lib/newQueryBuilder/queryBuilderMappers/mapCompositeQueryFromQuery';
import { cloneDeep } from 'lodash-es';
import {
	Check,
	ChevronUp,
	ConciergeBell,
	Disc3,
	PanelBottomClose,
	Plus,
	X,
	XCircle,
} from 'lucide-react';
import {
	CSSProperties,
	Dispatch,
	ReactElement,
	SetStateAction,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import { useSelector } from 'react-redux';
import { useHistory } from 'react-router-dom';
import { AppState } from 'store/reducers';
import { Dashboard } from 'types/api/dashboard/getAll';
import { Query } from 'types/api/queryBuilder/queryBuilderData';
import { DataSource, StringOperators } from 'types/common/queryBuilder';
import AppReducer from 'types/reducer/app';
import { USER_ROLES } from 'types/roles';

import { PreservedViewsTypes } from './constants';
import ExplorerOptionsHideArea from './ExplorerOptionsHideArea';
import { PreservedViewsInLocalStorage } from './types';
import {
	DATASOURCE_VS_ROUTES,
	generateRGBAFromHex,
	getRandomColor,
	saveNewViewHandler,
	setExplorerToolBarVisibility,
} from './utils';

const allowedRoles = [USER_ROLES.ADMIN, USER_ROLES.AUTHOR, USER_ROLES.EDITOR];

// eslint-disable-next-line sonarjs/cognitive-complexity
function ExplorerOptions({
	disabled,
	isLoading,
	onExport,
	query,
	sourcepage,
	isExplorerOptionHidden = false,
	setIsExplorerOptionHidden,
}: ExplorerOptionsProps): JSX.Element {
	const [isExport, setIsExport] = useState<boolean>(false);
	const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
	const [newViewName, setNewViewName] = useState<string>('');
	const [color, setColor] = useState(Color.BG_SIENNA_500);
	const [dropdownVisible, setDropdownVisible] = useState(false);
	const [searchText, setSearchText] = useState('');
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const { notifications } = useNotifications();
	const history = useHistory();
	const ref = useRef<RefSelectProps>(null);
	const inputRef = useRef<InputRef>(null);
	const isDarkMode = useIsDarkMode();
	const isLogsExplorer = sourcepage === DataSource.LOGS;

	const PRESERVED_VIEW_LOCAL_STORAGE_KEY = LOCALSTORAGE.LAST_USED_SAVED_VIEWS;
	const PRESERVED_VIEW_TYPE = isLogsExplorer
		? PreservedViewsTypes.LOGS
		: PreservedViewsTypes.TRACES;

	const {
		currentQuery,
		panelType,
		isStagedQueryUpdated,
		redirectWithQueryBuilderData,
	} = useQueryBuilder();

	const handleSaveViewModalToggle = (): void => {
		if (sourcepage === DataSource.TRACES) {
			logEvent('Traces Explorer: Save view clicked', {
				panelType,
			});
		} else if (isLogsExplorer) {
			logEvent('Logs Explorer: Save view clicked', {
				panelType,
			});
		}
		setIsSaveModalOpen(!isSaveModalOpen);
	};

	const hideSaveViewModal = (): void => {
		setIsSaveModalOpen(false);
	};

	const { role } = useSelector<AppState, AppReducer>((state) => state.app);

	const handleConditionalQueryModification = useCallback((): string => {
		if (
			query?.builder?.queryData?.[0]?.aggregateOperator !== StringOperators.NOOP
		) {
			return JSON.stringify(query);
		}

		// Modify aggregateOperator to count, as noop is not supported in alerts
		const modifiedQuery = cloneDeep(query);

		modifiedQuery.builder.queryData[0].aggregateOperator = StringOperators.COUNT;

		return JSON.stringify(modifiedQuery);
	}, [query]);

	const onCreateAlertsHandler = useCallback(() => {
		if (sourcepage === DataSource.TRACES) {
			logEvent('Traces Explorer: Create alert', {
				panelType,
			});
		} else if (isLogsExplorer) {
			logEvent('Logs Explorer: Create alert', {
				panelType,
			});
		}

		const stringifiedQuery = handleConditionalQueryModification();

		history.push(
			`${ROUTES.ALERTS_NEW}?${QueryParams.compositeQuery}=${encodeURIComponent(
				stringifiedQuery,
			)}`,
		);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [handleConditionalQueryModification, history]);

	const onDiscard = (): void => {
		setIsExport(false);
	};

	const onAddToDashboard = (): void => {
		if (sourcepage === DataSource.TRACES) {
			logEvent('Traces Explorer: Add to dashboard clicked', {
				panelType,
			});
		} else if (isLogsExplorer) {
			logEvent('Logs Explorer: Add to dashboard clicked', {
				panelType,
			});
		}
		setIsExport(true);
	};

	const {
		data: viewsData,
		isLoading: viewsIsLoading,
		error,
		isRefetching,
		refetch: refetchAllView,
	} = useGetAllViews(sourcepage);

	const compositeQuery = mapCompositeQueryFromQuery(currentQuery, panelType);

	const viewName = useGetSearchQueryParam(QueryParams.viewName) || '';
	const viewKey = useGetSearchQueryParam(QueryParams.viewKey) || '';

	const extraData = viewsData?.data?.data?.find((view) => view.uuid === viewKey)
		?.extraData;

	const extraDataColor = extraData ? JSON.parse(extraData).color : '';
	const rgbaColor = generateRGBAFromHex(
		extraDataColor || Color.BG_SIENNA_500,
		0.08,
	);

	const {
		mutateAsync: updateViewAsync,
		isLoading: isViewUpdating,
	} = useUpdateView({
		compositeQuery,
		viewKey,
		extraData: extraData || JSON.stringify({ color: Color.BG_SIENNA_500 }),
		sourcePage: sourcepage,
		viewName,
	});

	const showErrorNotification = (err: Error): void => {
		notifications.error({
			message: axios.isAxiosError(err) ? err.message : SOMETHING_WENT_WRONG,
		});
	};

	const onUpdateQueryHandler = (): void => {
		const extraData = viewsData?.data?.data?.find((view) => view.uuid === viewKey)
			?.extraData;
		updateViewAsync(
			{
				compositeQuery: mapCompositeQueryFromQuery(currentQuery, panelType),
				viewKey,
				extraData: extraData || JSON.stringify({ color: Color.BG_SIENNA_500 }),
				sourcePage: sourcepage,
				viewName,
			},
			{
				onSuccess: () => {
					notifications.success({
						message: 'View Updated Successfully',
					});
					refetchAllView();
				},
				onError: (err) => {
					showErrorNotification(err);
				},
			},
		);
	};

	useErrorNotification(error);

	const { handleExplorerTabChange } = useHandleExplorerTabChange();

	const onMenuItemSelectHandler = useCallback(
		({ key }: { key: string }): void => {
			const currentViewDetails = getViewDetailsUsingViewKey(
				key,
				viewsData?.data?.data,
			);
			if (!currentViewDetails) return;
			const {
				query,
				name,
				uuid,
				panelType: currentPanelType,
			} = currentViewDetails;

			handleExplorerTabChange(currentPanelType, {
				query,
				name,
				uuid,
			});
		},
		[viewsData, handleExplorerTabChange],
	);

	const updatePreservedViewInLocalStorage = (option: {
		key: string;
		value: string;
	}): void => {
		// Retrieve stored views from local storage
		const storedViews = localStorage.getItem(PRESERVED_VIEW_LOCAL_STORAGE_KEY);

		// Initialize or parse the stored views
		const updatedViews: PreservedViewsInLocalStorage = storedViews
			? JSON.parse(storedViews)
			: {};

		// Update the views with the new selection
		updatedViews[PRESERVED_VIEW_TYPE] = {
			key: option.key,
			value: option.value,
		};

		// Save the updated views back to local storage
		localStorage.setItem(
			PRESERVED_VIEW_LOCAL_STORAGE_KEY,
			JSON.stringify(updatedViews),
		);
	};

	const handleSelect = (
		value: string,
		option: { key: string; value: string },
	): void => {
		onMenuItemSelectHandler({
			key: option.key,
		});
		if (sourcepage === DataSource.TRACES) {
			logEvent('Traces Explorer: Select view', {
				panelType,
				viewName: option?.value,
			});
		} else if (isLogsExplorer) {
			logEvent('Logs Explorer: Select view', {
				panelType,
				viewName: option?.value,
			});
		}

		updatePreservedViewInLocalStorage(option);

		if (ref.current) {
			ref.current.blur();
		}
	};

	const removeCurrentViewFromLocalStorage = (): void => {
		// Retrieve stored views from local storage
		const storedViews = localStorage.getItem(PRESERVED_VIEW_LOCAL_STORAGE_KEY);

		if (storedViews) {
			// Parse the stored views
			const parsedViews = JSON.parse(storedViews);

			// Remove the current view type from the parsed views
			delete parsedViews[PRESERVED_VIEW_TYPE];

			// Update local storage with the modified views
			localStorage.setItem(
				PRESERVED_VIEW_LOCAL_STORAGE_KEY,
				JSON.stringify(parsedViews),
			);
		}
	};

	const handleClearSelect = (): void => {
		removeCurrentViewFromLocalStorage();

		history.replace(DATASOURCE_VS_ROUTES[sourcepage]);
	};

	const isQueryUpdated = isStagedQueryUpdated(viewsData?.data?.data, viewKey);

	const {
		isLoading: isSaveViewLoading,
		mutateAsync: saveViewAsync,
	} = useSaveView({
		viewName: newViewName || '',
		compositeQuery,
		sourcePage: sourcepage,
		extraData: JSON.stringify({ color }),
	});

	const onSaveHandler = (): void => {
		saveNewViewHandler({
			compositeQuery,
			handlePopOverClose: hideSaveViewModal,
			extraData: JSON.stringify({ color }),
			notifications,
			panelType: panelType || PANEL_TYPES.LIST,
			redirectWithQueryBuilderData,
			refetchAllView,
			saveViewAsync,
			sourcePage: sourcepage,
			viewName: newViewName,
			setNewViewName,
		});
		if (sourcepage === DataSource.TRACES) {
			logEvent('Traces Explorer: Save view successful', {
				panelType,
				viewName: newViewName,
			});
		} else if (isLogsExplorer) {
			logEvent('Logs Explorer: Save view successful', {
				panelType,
				viewName: newViewName,
			});
		}
	};

	// TODO: Remove this and move this to scss file
	const dropdownStyle: CSSProperties = useMemo(
		() => ({
			borderRadius: '4px',
			border: isDarkMode
				? `1px solid ${Color.BG_SLATE_400}`
				: `1px solid ${Color.BG_VANILLA_300}`,
			background: isDarkMode
				? 'linear-gradient(139deg, rgba(18, 19, 23, 0.80) 0%, rgba(18, 19, 23, 0.90) 98.68%)'
				: 'linear-gradient(139deg, rgba(241, 241, 241, 0.8) 0%, rgba(241, 241, 241, 0.9) 98.68%)',
			boxShadow: '4px 10px 16px 2px rgba(0, 0, 0, 0.20)',
			backdropFilter: 'blur(20px)',
			bottom: '74px',
			width: '191px',
		}),
		[isDarkMode],
	);

	const hideToolbar = (): void => {
		setExplorerToolBarVisibility(false, sourcepage);
		if (setIsExplorerOptionHidden) {
			setIsExplorerOptionHidden(true);
		}
	};

	const isEditDeleteSupported = allowedRoles.includes(role as string);

	const [
		isRecentlyUsedSavedViewSelected,
		setIsRecentlyUsedSavedViewSelected,
	] = useState(false);

	useEffect(() => {
		const parsedPreservedView = JSON.parse(
			localStorage.getItem(PRESERVED_VIEW_LOCAL_STORAGE_KEY) || '{}',
		);

		const preservedView = parsedPreservedView[PRESERVED_VIEW_TYPE] || {};

		let timeoutId: string | number | NodeJS.Timeout | undefined;

		if (
			!!preservedView?.key &&
			viewsData?.data?.data &&
			!(!!viewName || !!viewKey) &&
			!isRecentlyUsedSavedViewSelected
		) {
			// prevent the race condition with useShareBuilderUrl
			timeoutId = setTimeout(() => {
				onMenuItemSelectHandler({ key: preservedView.key });
			}, 0);
			setIsRecentlyUsedSavedViewSelected(false);
		}

		return (): void => clearTimeout(timeoutId);
	}, [
		PRESERVED_VIEW_LOCAL_STORAGE_KEY,
		PRESERVED_VIEW_TYPE,
		isRecentlyUsedSavedViewSelected,
		onMenuItemSelectHandler,
		viewKey,
		viewName,
		viewsData?.data?.data,
	]);

	return (
		<div className="explorer-options-container">
			{isQueryUpdated && !isExplorerOptionHidden && !isExport && (
				<div
					className={cx(
						isEditDeleteSupported ? '' : 'hide-update',
						'explorer-update',
					)}
				>
					<Tooltip title="Clear this view" placement="top">
						<Button
							className="action-icon"
							onClick={handleClearSelect}
							icon={<X size={14} />}
						/>
					</Tooltip>
					<Divider
						type="vertical"
						className={isEditDeleteSupported ? '' : 'hidden'}
					/>
					<Tooltip title="Update this view" placement="top">
						<Button
							className={cx('action-icon', isEditDeleteSupported ? ' ' : 'hidden')}
							disabled={isViewUpdating}
							onClick={onUpdateQueryHandler}
							icon={<Disc3 size={14} />}
						/>
					</Tooltip>
				</div>
			)}
			{!isExplorerOptionHidden &&
				(isExport ? (
					<div className="export-panel-container">
						<ExportPanelContainer
							query={query}
							isLoading={isLoading}
							onExport={onExport}
							onDiscard={onDiscard}
						/>
					</div>
				) : (
					<div
						className="explorer-options"
						style={{
							background: extraData
								? `linear-gradient(90deg, rgba(0,0,0,0) -5%, ${rgbaColor} 9%, rgba(0,0,0,0) 30%)`
								: 'transparent',
						}}
					>
						<div className="view-options">
							<Select
								placeholder="Select a view"
								loading={viewsIsLoading || isRefetching}
								value={viewName || undefined}
								onSelect={handleSelect}
								style={{ minWidth: 170 }}
								dropdownStyle={dropdownStyle}
								className="views-dropdown"
								onClear={handleClearSelect}
								allowClear={
									viewName && !dropdownOpen
										? { clearIcon: <XCircle size={16} /> }
										: false
								}
								ref={ref}
								suffixIcon={dropdownOpen && <ChevronUp size={16} />}
								// eslint-disable-next-line react/no-unstable-nested-components
								dropdownRender={(menu): ReactElement => (
									<>
										{dropdownVisible && (
											<Input
												ref={inputRef}
												placeholder="Search..."
												value={searchText}
												onChange={(e: React.ChangeEvent<HTMLInputElement>): void => {
													setSearchText(e.target.value);
												}}
												style={{ marginBottom: '8px' }}
											/>
										)}
										{menu}
									</>
								)}
								filterOption={(input, option): boolean =>
									(option?.value ?? '').toLowerCase().includes(input.toLowerCase())
								}
								open={dropdownVisible}
								onDropdownVisibleChange={(visible: boolean): void => {
									setDropdownOpen(visible);
									setDropdownVisible(visible);
									if (visible) {
										setTimeout(() => inputRef.current?.focus(), 100);
									}
								}}
								searchValue={searchText}
								onSearch={setSearchText}
							>
								{viewsData?.data?.data?.map((view) => {
									const extraData =
										view.extraData !== '' ? JSON.parse(view.extraData) : '';
									let bgColor = getRandomColor();
									if (extraData !== '') {
										bgColor = extraData.color;
									}
									return (
										<Select.Option key={view.uuid} value={view.name}>
											<div className="render-options">
												<span
													className="dot"
													style={{
														background: bgColor,
														boxShadow: `0px 0px 6px 0px ${bgColor}`,
													}}
												/>{' '}
												{view.name}
											</div>
										</Select.Option>
									);
								})}
							</Select>

							<Button
								shape="round"
								onClick={handleSaveViewModalToggle}
								className={isEditDeleteSupported ? '' : 'hidden'}
								disabled={viewsIsLoading || isRefetching}
								icon={<Disc3 size={16} />}
							>
								Save this view
							</Button>
						</div>

						<hr className={isEditDeleteSupported ? '' : 'hidden'} />

						<div className={cx('actions', isEditDeleteSupported ? '' : 'hidden')}>
							<Tooltip title="Create an Alert">
								<Button
									disabled={disabled}
									onClick={onCreateAlertsHandler}
									icon={<ConciergeBell size={16} />}
									style={{
										background: 'none',
										border: 'none',
									}}
								/>
							</Tooltip>

							<Tooltip title="Add to Dashboard">
								<Button
									disabled={disabled}
									onClick={onAddToDashboard}
									icon={<Plus size={16} />}
									style={{
										background: 'none',
										border: 'none',
									}}
								/>
							</Tooltip>
						</div>
						<div className="actions">
							<Tooltip
								title={
									<div>
										{isLogsExplorer
											? 'Learn more about Logs explorer '
											: 'Learn more about Traces explorer '}
										<Typography.Link
											href={
												isLogsExplorer
													? 'https://signoz.io/docs/product-features/logs-explorer/?utm_source=product&utm_medium=logs-explorer-toolbar'
													: 'https://signoz.io/docs/product-features/trace-explorer/?utm_source=product&utm_medium=trace-explorer-toolbar'
											}
											target="_blank"
										>
											{' '}
											here
										</Typography.Link>{' '}
									</div>
								}
							>
								<InfoCircleOutlined className="info-icon" />
							</Tooltip>
							<Tooltip title="Hide">
								<Button
									disabled={disabled}
									shape="circle"
									onClick={hideToolbar}
									icon={<PanelBottomClose size={16} />}
									data-testid="hide-toolbar"
								/>
							</Tooltip>
						</div>
					</div>
				))}

			<ExplorerOptionsHideArea
				isExplorerOptionHidden={isExplorerOptionHidden}
				setIsExplorerOptionHidden={setIsExplorerOptionHidden}
				sourcepage={sourcepage}
				isQueryUpdated={isQueryUpdated}
				handleClearSelect={handleClearSelect}
				onUpdateQueryHandler={onUpdateQueryHandler}
				isEditDeleteSupported={isEditDeleteSupported}
			/>

			<Modal
				className="save-view-modal"
				title={<span className="title">Save this view</span>}
				open={isSaveModalOpen}
				closable
				onCancel={hideSaveViewModal}
				footer={[
					<Button
						key="submit"
						type="primary"
						icon={<Check size={16} />}
						onClick={onSaveHandler}
						disabled={isSaveViewLoading}
						data-testid="save-view-btn"
					>
						Save this view
					</Button>,
				]}
			>
				<Typography.Text>Label</Typography.Text>
				<div className="save-view-input">
					<ColorPicker
						value={color}
						onChange={(value, hex): void => setColor(hex)}
					/>
					<Input
						placeholder="e.g. External http method view"
						value={newViewName}
						onChange={(e): void => setNewViewName(e.target.value)}
					/>
				</div>
			</Modal>
		</div>
	);
}

export interface ExplorerOptionsProps {
	isLoading?: boolean;
	onExport: (dashboard: Dashboard | null, isNewDashboard?: boolean) => void;
	query: Query | null;
	disabled: boolean;
	sourcepage: DataSource;
	isExplorerOptionHidden?: boolean;
	setIsExplorerOptionHidden?: Dispatch<SetStateAction<boolean>>;
}

ExplorerOptions.defaultProps = {
	isLoading: false,
	isExplorerOptionHidden: false,
	setIsExplorerOptionHidden: undefined,
};

export default ExplorerOptions;
