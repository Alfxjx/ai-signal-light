package com.aisignallight.ui.home

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavController
import com.aisignallight.R

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
        when (selectedTab) {
            HomeTab.Usage -> UsageTab(
                usage = uiState.usage,
                config = uiState.config,
                isLoading = uiState.isLoading,
                onRefresh = { viewModel.refresh() },
                modifier = Modifier.padding(innerPadding)
            )
            HomeTab.Claude -> ClaudeTab(
                state = uiState.projectSync,
                modifier = Modifier.padding(innerPadding)
            )
        }
    }
}
