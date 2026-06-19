package com.aisignallight.ui.home

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.aisignallight.R
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

sealed class HomeTab(val labelRes: Int, val icon: androidx.compose.ui.graphics.vector.ImageVector) {
    data object Usage : HomeTab(R.string.usage_title, Icons.Default.Home)
    data object Claude : HomeTab(R.string.claude_title, Icons.AutoMirrored.Filled.List)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    navController: NavController,
    viewModel: HomeViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    var selectedTab by remember { mutableStateOf<HomeTab>(HomeTab.Usage) }
    val projectSync = uiState.projectSync

    val context = LocalContext.current
    val activity = context as? ComponentActivity
    var notificationDenied by remember { mutableStateOf(false) }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (!isGranted) notificationDenied = true
    }

    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || activity == null) return@LaunchedEffect
        val granted = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED
        if (!granted) {
            permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.app_name)) },
                actions = {
                    IconButton(onClick = { navController.navigate("settings") }) {
                        Icon(Icons.Default.Settings, contentDescription = "设置")
                    }
                }
            )
        },
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    icon = { Icon(HomeTab.Usage.icon, contentDescription = null) },
                    label = { Text(stringResource(HomeTab.Usage.labelRes)) },
                    selected = selectedTab == HomeTab.Usage,
                    onClick = { selectedTab = HomeTab.Usage }
                )
                NavigationBarItem(
                    icon = { Icon(HomeTab.Claude.icon, contentDescription = null) },
                    label = { Text(stringResource(HomeTab.Claude.labelRes)) },
                    selected = selectedTab == HomeTab.Claude,
                    onClick = { selectedTab = HomeTab.Claude }
                )
            }
        }
    ) { innerPadding ->
        Column(modifier = Modifier.padding(innerPadding)) {
            if (projectSync.isConnected || !projectSync.error.isNullOrBlank() || notificationDenied) {
                ConnectionBanner(
                    isConnected = projectSync.isConnected,
                    lastSyncAt = projectSync.lastSyncAt,
                    error = projectSync.error,
                    notificationDenied = notificationDenied
                )
            }
            when (selectedTab) {
                HomeTab.Usage -> UsageTab(
                    usage = uiState.usage,
                    config = uiState.config,
                    isLoading = uiState.isLoading,
                    onRefresh = { viewModel.refresh() },
                    modifier = Modifier
                        .fillMaxSize()
                        .weight(1f)
                )
                HomeTab.Claude -> ClaudeTab(
                    state = uiState.projectSync,
                    modifier = Modifier
                        .fillMaxSize()
                        .weight(1f)
                )
            }
        }
    }
}

@Composable
private fun ConnectionBanner(
    isConnected: Boolean,
    lastSyncAt: Long?,
    error: String?,
    notificationDenied: Boolean
) {
    val containerColor = when {
        notificationDenied -> MaterialTheme.colorScheme.secondaryContainer
        isConnected -> MaterialTheme.colorScheme.primaryContainer
        else -> MaterialTheme.colorScheme.errorContainer
    }
    val contentColor = when {
        notificationDenied -> MaterialTheme.colorScheme.onSecondaryContainer
        isConnected -> MaterialTheme.colorScheme.onPrimaryContainer
        else -> MaterialTheme.colorScheme.onErrorContainer
    }

    val syncText = lastSyncAt?.let {
        stringResource(R.string.connection_last_sync, formatTime(it))
    }
    val mainText = when {
        notificationDenied -> stringResource(R.string.notification_permission_denied)
        isConnected -> stringResource(R.string.connection_connected)
        !error.isNullOrBlank() -> error
        else -> stringResource(R.string.offline_hint)
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        colors = CardDefaults.cardColors(
            containerColor = containerColor,
            contentColor = contentColor
        )
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text(text = mainText, style = MaterialTheme.typography.bodyMedium)
            if (isConnected && syncText != null) {
                Text(
                    text = syncText,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = 4.dp)
                )
            }
        }
    }
}

private fun formatTime(timestamp: Long): String {
    return SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date(timestamp))
}
